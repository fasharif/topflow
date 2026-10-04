import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { Prisma } from '@topflow/database';
import {
  DISPATCH_EVENT_ID_HEADER,
  DispatchEventOutcome,
  dispatchEventEnvelopeSchema,
  dispatchEventSchema,
  isKnownDispatchEventType,
  type DispatchEvent,
  type DispatchEventEnvelope,
  type DispatchEventReceiptDto,
} from '@topflow/shared';
import { FeatureDisabledException } from '../common/feature-disabled.exception';
import type { RequestMeta } from '../common/request-context';
import { stripNul } from '../common/strip-nul.pipe';
import { InjectConfig } from '../config/config.module';
import type { AppConfig } from '../config/env';
import { dispatchDeliveryFrom } from '../orders/dispatch-delivery';
import type { OrderRecord } from '../orders/order.mapper';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { verifyDispatchSignature } from './dispatch-signature';

/**
 * The events the dispatch service sends are three levels deep. The whole event is stored as JSON,
 * and one nested a few thousand levels deep could not be written (the call stack ran out, a 500
 * that the dispatch service kept retrying), so anything far deeper than a real event is a 400.
 */
const MAX_EVENT_DEPTH = 32;

const SIGNATURE_ERRORS = {
  missing: 'The x-dispatch-signature header is missing',
  malformed: 'The x-dispatch-signature header is malformed',
  expired: 'The signature timestamp is outside the accepted window',
  mismatch: 'The signature does not match the body',
} as const;

/**
 * Receives webhook events from the dispatch delivery service (ADR-024).
 *
 * Each event is checked against its HMAC signature, then recorded under its event id in the
 * same transaction as any change it causes. A repeated event (the dispatch service delivers at
 * least once) finds its id already recorded and changes nothing. Only delivery.completed changes
 * an order; the other event types, including types added to the dispatch service later, are
 * recorded and acknowledged. A completed delivery for an order the warehouse has not marked
 * dispatched yet is recorded as PENDING and applied when the warehouse does.
 */
@Injectable()
export class DispatchEventsService {
  private readonly logger = new Logger(DispatchEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    @InjectConfig() private readonly config: AppConfig,
  ) {}

  async receive(
    rawBody: Buffer | undefined,
    headers: { signature?: string; eventId?: string },
    meta: RequestMeta,
  ): Promise<DispatchEventReceiptDto> {
    const { dispatchWebhookSecrets, dispatchWebhookToleranceSeconds } =
      this.config.integrations;
    if (dispatchWebhookSecrets.length === 0) {
      // 503 so the dispatch service retries; not reported as a server error (see the exception).
      throw new FeatureDisabledException(
        'The dispatch integration is not configured',
        'INTEGRATION_DISABLED',
      );
    }
    if (!rawBody || rawBody.length === 0) {
      throw new BadRequestException('The request has no body');
    }
    const check = verifyDispatchSignature(
      headers.signature,
      rawBody,
      dispatchWebhookSecrets,
      dispatchWebhookToleranceSeconds,
    );
    if (!check.valid) {
      this.logger.warn(
        `Refused a dispatch event: ${check.reason} [${meta.requestId}]`,
      );
      throw new UnauthorizedException({
        message: SIGNATURE_ERRORS[check.reason],
        code: 'INVALID_SIGNATURE',
      });
    }

    const { json, envelope } = this.parseEnvelope(rawBody);
    if (!headers.eventId) {
      throw new BadRequestException(
        `The ${DISPATCH_EVENT_ID_HEADER} header is missing`,
      );
    }
    if (headers.eventId !== envelope.id) {
      throw new BadRequestException(
        `The ${DISPATCH_EVENT_ID_HEADER} header does not match the event id`,
      );
    }
    // A type TopFlow knows is checked in full; a newer one only by its envelope.
    const event = isKnownDispatchEventType(envelope.type)
      ? this.parseKnown(json)
      : null;

    let delivered: OrderRecord | null = null;
    const receipt = await this.prisma.$transaction(async (tx) => {
      // Lock the order first: the warehouse dispatching it at the same moment waits for this
      // transaction, or this one waits for it, so a waiting delivery cannot be missed.
      const linked = await lockOrder(tx, envelope.data.orderReference);
      // ON CONFLICT DO NOTHING: a concurrent copy of this event waits for this transaction and
      // then finds the id taken.
      const { count } = await tx.dispatchEvent.createMany({
        data: [
          {
            id: envelope.id,
            type: envelope.type,
            deliveryId: envelope.data.deliveryId,
            orderReference: envelope.data.orderReference,
            orderId: linked,
            outcome: DispatchEventOutcome.IGNORED,
            occurredAt: new Date(envelope.data.occurredAt),
            payload: json as Prisma.InputJsonValue,
          },
        ],
        skipDuplicates: true,
      });
      if (count === 0) {
        return this.receiptFor(envelope, 'DUPLICATE', null);
      }
      if (event?.type !== 'delivery.completed') {
        if (!event) {
          // Quoted as JSON: the type is the sender's text, and a line break in it would
          // otherwise start a new, made-up log line.
          this.logger.log(
            `Recorded a dispatch event of a type TopFlow does not act on: ${JSON.stringify(envelope.type)}`,
          );
        }
        return this.receiptFor(envelope, DispatchEventOutcome.IGNORED, null);
      }

      const result = await this.orders.deliverFromDispatch(
        tx,
        dispatchDeliveryFrom(event, { ipAddress: meta.ipAddress }),
      );
      const outcome =
        result.outcome === 'applied'
          ? DispatchEventOutcome.APPLIED
          : result.outcome === 'waiting'
            ? DispatchEventOutcome.PENDING
            : DispatchEventOutcome.IGNORED;
      await tx.dispatchEvent.update({
        where: { id: event.id },
        data: { outcome, orderId: result.order.id },
      });
      if (result.outcome === 'applied') delivered = result.order;
      return this.receiptFor(
        envelope,
        outcome,
        result.outcome === 'applied' ? 'DELIVERED' : result.order.status,
      );
    });

    if (delivered) this.orders.notifyDelivered(delivered);
    return receipt;
  }

  private parseEnvelope(rawBody: Buffer): {
    json: unknown;
    envelope: DispatchEventEnvelope;
  } {
    let json: unknown;
    try {
      // The signature was checked over the bytes as sent. NUL characters are then dropped, as for
      // every other request (StripNulPipe): PostgreSQL stores them neither in text nor in JSON,
      // so an event carrying one ended in a 500 that the dispatch service kept retrying.
      json = stripNul(JSON.parse(rawBody.toString('utf8')));
    } catch {
      throw new BadRequestException('The body is not valid JSON');
    }
    if (nestedDeeperThan(json, MAX_EVENT_DEPTH)) {
      throw new BadRequestException(
        `Invalid dispatch event (nested more than ${MAX_EVENT_DEPTH} levels deep)`,
      );
    }
    const parsed = dispatchEventEnvelopeSchema.safeParse(json);
    if (!parsed.success) throw invalidEvent(parsed.error.issues[0]);
    return { json, envelope: parsed.data };
  }

  private parseKnown(json: unknown): DispatchEvent {
    const parsed = dispatchEventSchema.safeParse(json);
    if (!parsed.success) throw invalidEvent(parsed.error.issues[0]);
    return parsed.data;
  }

  private receiptFor(
    event: DispatchEventEnvelope,
    outcome: DispatchEventReceiptDto['outcome'],
    orderStatus: DispatchEventReceiptDto['orderStatus'],
  ): DispatchEventReceiptDto {
    return {
      eventId: event.id,
      outcome,
      orderNumber: event.data.orderReference,
      orderStatus,
    };
  }
}

function invalidEvent(
  issue: { path: PropertyKey[]; message: string } | undefined,
): BadRequestException {
  return new BadRequestException(
    `Invalid dispatch event${issue ? ` (${issue.path.map(String).join('.')}: ${issue.message})` : ''}`,
  );
}

/** Whether arrays and objects are nested more than `limit` levels deep (walked without recursion). */
export function nestedDeeperThan(value: unknown, limit: number): boolean {
  const pending: [unknown, number][] = [[value, 1]];
  for (let next = pending.pop(); next; next = pending.pop()) {
    const [item, depth] = next;
    if (item === null || typeof item !== 'object') continue;
    if (depth > limit) return true;
    for (const child of Object.values(item)) pending.push([child, depth + 1]);
  }
  return false;
}

/** Locks the order the event is about, if it exists, and returns its id. */
async function lockOrder(
  tx: Prisma.TransactionClient,
  orderNumber: string,
): Promise<string | null> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "orders" WHERE "orderNumber" = ${orderNumber} FOR UPDATE`;
  return rows[0]?.id ?? null;
}
