import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  DISPATCH_EVENT_ID_HEADER,
  DispatchEventOutcome,
  dispatchEventSchema,
  type DispatchEvent,
  type DispatchEventReceiptDto,
} from '@topflow/shared';
import type { RequestMeta } from '../common/request-context';
import { InjectConfig } from '../config/config.module';
import type { AppConfig } from '../config/env';
import type { OrderRecord } from '../orders/order.mapper';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { verifyDispatchSignature } from './dispatch-signature';

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
 * same transaction as any change it causes. A repeated event (dispatch delivers at least once)
 * finds its id already recorded and changes nothing. Only delivery.completed changes an order;
 * the other event types are recorded and acknowledged.
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
      throw new ServiceUnavailableException({
        message: 'The dispatch integration is not configured',
        code: 'INTEGRATION_DISABLED',
      });
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

    const event = this.parse(rawBody);
    if (headers.eventId !== undefined && headers.eventId !== event.id) {
      throw new BadRequestException(
        `The ${DISPATCH_EVENT_ID_HEADER} header does not match the event id`,
      );
    }

    let delivered: OrderRecord | null = null;
    const receipt = await this.prisma.$transaction(async (tx) => {
      const linked = await tx.order.findUnique({
        where: { orderNumber: event.data.orderReference },
        select: { id: true },
      });
      // ON CONFLICT DO NOTHING: a concurrent copy of this event waits for this transaction and
      // then finds the id taken.
      const { count } = await tx.dispatchEvent.createMany({
        data: [
          {
            id: event.id,
            type: event.type,
            deliveryId: event.data.deliveryId,
            orderReference: event.data.orderReference,
            orderId: linked?.id ?? null,
            outcome: DispatchEventOutcome.IGNORED,
            occurredAt: new Date(event.data.occurredAt),
            payload: event,
          },
        ],
        skipDuplicates: true,
      });
      if (count === 0) {
        return this.receiptFor(event, 'DUPLICATE', null);
      }
      if (event.type !== 'delivery.completed') {
        return this.receiptFor(event, DispatchEventOutcome.IGNORED, null);
      }

      const result = await this.orders.deliverFromDispatch(tx, {
        orderNumber: event.data.orderReference,
        deliveredAt: this.deliveredAt(event),
        note: deliveryNote(event),
        ipAddress: meta.ipAddress,
        auditDetails: {
          eventId: event.id,
          deliveryId: event.data.deliveryId,
          driver: event.data.driver?.name ?? null,
          proof: event.data.proof ?? null,
        },
      });
      const outcome = result.applied
        ? DispatchEventOutcome.APPLIED
        : DispatchEventOutcome.IGNORED;
      await tx.dispatchEvent.update({
        where: { id: event.id },
        data: { outcome, orderId: result.order.id },
      });
      if (result.applied) delivered = result.order;
      return this.receiptFor(
        event,
        outcome,
        result.applied ? 'DELIVERED' : result.order.status,
      );
    });

    if (delivered) this.orders.notifyDelivered(delivered);
    return receipt;
  }

  private parse(rawBody: Buffer): DispatchEvent {
    let json: unknown;
    try {
      json = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('The body is not valid JSON');
    }
    const parsed = dispatchEventSchema.safeParse(json);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new BadRequestException(
        `Invalid dispatch event${issue ? ` (${issue.path.join('.')}: ${issue.message})` : ''}`,
      );
    }
    return parsed.data;
  }

  /** When dispatch says the delivery happened; never later than now (the sender's clock may run ahead). */
  private deliveredAt(event: DispatchEvent): Date {
    const reported = new Date(
      event.data.proof?.capturedAt ?? event.data.occurredAt,
    );
    return reported.getTime() > Date.now() ? new Date() : reported;
  }

  private receiptFor(
    event: DispatchEvent,
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

/** e.g. "Delivery confirmed by dispatch (driver Omar Haddad): signed by Aisha Rahman, 12 m from the drop-off point" */
function deliveryNote(event: DispatchEvent): string {
  const proof = event.data.proof;
  const driver = event.data.driver ? ` (driver ${event.data.driver.name})` : '';
  if (!proof) return `Delivery confirmed by dispatch${driver}`;
  return (
    `Delivery confirmed by dispatch${driver}: signed by ${proof.recipientName}, ` +
    `${Math.round(proof.distanceMeters)} m from the drop-off point` +
    (proof.hasPhoto ? ', photo taken' : '')
  );
}
