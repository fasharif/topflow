import { createHmac, randomUUID } from 'node:crypto';
import type { DispatchEvent, DispatchEventType } from '@topflow/shared';

/** Signs a webhook body exactly as the dispatch service does. */
export function signDispatchBody(
  secret: string,
  rawBody: string,
  timestampSeconds: number = Math.floor(Date.now() / 1000),
): string {
  const t = String(Math.floor(timestampSeconds));
  const v1 = createHmac('sha256', secret)
    .update(`${t}.${rawBody}`)
    .digest('hex');
  return `t=${t},v1=${v1}`;
}

/** A dispatch event for an order, shaped like the ones the dispatch outbox sends. */
export function dispatchEvent(
  type: DispatchEventType,
  orderReference: string,
  overrides: Partial<DispatchEvent['data']> = {},
): DispatchEvent {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    type,
    createdAt: now,
    data: {
      deliveryId: randomUUID(),
      orderReference,
      status: type === 'delivery.completed' ? 'delivered' : 'assigned',
      occurredAt: now,
      driver: { id: randomUUID(), name: 'Omar Haddad' },
      ...(type === 'delivery.completed' && {
        proof: {
          recipientName: 'Aisha Rahman',
          capturedAt: now,
          withinGeofence: true,
          distanceMeters: 12.4,
          hasPhoto: true,
          hasSignature: true,
        },
      }),
      ...overrides,
    },
  };
}
