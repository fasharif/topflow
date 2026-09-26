import type { Prisma } from '@topflow/database';
import type { DispatchEvent } from '@topflow/shared';

/** A delivery the dispatch service reports as completed (ADR-024). */
export interface DispatchDelivery {
  orderNumber: string;
  deliveredAt: Date;
  /** Shown on the order timeline. */
  note: string;
  ipAddress: string | null;
  auditDetails: Prisma.InputJsonObject;
}

/**
 * What an order records when the dispatch service reports a delivery as completed.
 *
 * `notBefore` is set when the completion waited for the warehouse to mark the order dispatched:
 * the order then counts as delivered from that moment, so it is never delivered before it was
 * dispatched, and the timeline note says the driver finished earlier. The driver's own time stays
 * in the audit record (proof.capturedAt).
 */
export function dispatchDeliveryFrom(
  event: DispatchEvent,
  options: { ipAddress: string | null; notBefore?: Date },
): DispatchDelivery {
  const reported = Date.parse(
    event.data.proof?.capturedAt ?? event.data.occurredAt,
  );
  const notBefore = options.notBefore?.getTime();
  const waited = notBefore !== undefined && notBefore > reported;
  // Never later than now: the sender's clock may run ahead.
  const deliveredAt = waited ? notBefore : Math.min(reported, Date.now());
  return {
    orderNumber: event.data.orderReference,
    deliveredAt: new Date(deliveredAt),
    note:
      deliveryNote(event) +
      (waited
        ? ' · The driver completed it before the order was marked dispatched'
        : ''),
    ipAddress: options.ipAddress,
    auditDetails: {
      eventId: event.id,
      deliveryId: event.data.deliveryId,
      driver: event.data.driver?.name ?? null,
      proof: event.data.proof ?? null,
      ...(waited && { waitedForDispatch: true }),
    },
  };
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
