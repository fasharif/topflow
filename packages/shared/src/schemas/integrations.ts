import { z } from 'zod';
import type { DispatchEventOutcome, OrderStatus } from '../enums';

/**
 * Events from dispatch, the delivery-tracking service built alongside this platform, sent as
 * signed webhooks. Delivery is at least once and in no particular order, so every event carries
 * an id the receiver de-duplicates on.
 */
export const DISPATCH_EVENT_ID_HEADER = 'x-dispatch-event-id';
export const DISPATCH_EVENT_TYPE_HEADER = 'x-dispatch-event-type';
/** `t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">` */
export const DISPATCH_SIGNATURE_HEADER = 'x-dispatch-signature';

export const DISPATCH_EVENT_TYPES = [
  'delivery.assigned',
  'delivery.picked_up',
  'delivery.completed',
  'delivery.failed',
  'delivery.cancelled',
] as const;
export type DispatchEventType = (typeof DISPATCH_EVENT_TYPES)[number];

const isoDateTime = z.iso.datetime({ offset: true, error: 'Expected an ISO 8601 date and time' });

export const dispatchEventSchema = z.object({
  id: z.uuid({ error: 'Invalid event id' }),
  type: z.enum(DISPATCH_EVENT_TYPES),
  createdAt: isoDateTime,
  data: z.object({
    deliveryId: z.uuid({ error: 'Invalid delivery id' }),
    /** The TopFlow order number the delivery was created for, e.g. TF-SO-2026-000123. */
    orderReference: z.string().trim().min(1).max(64),
    status: z.string(),
    occurredAt: isoDateTime,
    driver: z.object({ id: z.uuid(), name: z.string().max(120) }).nullable(),
    trackingUrl: z.string().max(2000).optional(),
    reason: z.string().max(500).optional(),
    proof: z
      .object({
        recipientName: z.string().max(120),
        capturedAt: isoDateTime,
        withinGeofence: z.boolean(),
        distanceMeters: z.number().min(0),
        hasPhoto: z.boolean(),
        hasSignature: z.boolean(),
      })
      .optional(),
  }),
});
export type DispatchEvent = z.infer<typeof dispatchEventSchema>;

/**
 * The answer to a received event: what it did (see DispatchEventOutcome), or DUPLICATE when this
 * event id was received before and nothing was done again.
 */
export interface DispatchEventReceiptDto {
  eventId: string;
  outcome: DispatchEventOutcome | 'DUPLICATE';
  orderNumber: string | null;
  orderStatus: OrderStatus | null;
}
