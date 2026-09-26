import type { DispatchEvent } from '@topflow/shared';
import { dispatchDeliveryFrom } from './dispatch-delivery';

const completed = (capturedAt: string): DispatchEvent => ({
  id: '7b0e8f2e-8d0a-4c55-9d6f-2f1d3c4b5a61',
  type: 'delivery.completed',
  createdAt: capturedAt,
  data: {
    deliveryId: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
    orderReference: 'TF-SO-2026-000123',
    status: 'delivered',
    occurredAt: capturedAt,
    driver: { id: '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f60', name: 'Omar Haddad' },
    proof: {
      recipientName: 'Aisha Rahman',
      capturedAt,
      withinGeofence: true,
      distanceMeters: 42.4,
      hasPhoto: true,
      hasSignature: true,
    },
  },
});

describe('dispatchDeliveryFrom', () => {
  it('records the time the driver captured the proof, with the proof on the timeline', () => {
    const delivery = dispatchDeliveryFrom(completed('2026-09-20T10:00:00Z'), {
      ipAddress: '203.0.113.7',
    });
    expect(delivery.deliveredAt.toISOString()).toBe('2026-09-20T10:00:00.000Z');
    expect(delivery.note).toBe(
      'Delivery confirmed by dispatch (driver Omar Haddad): signed by Aisha Rahman, 42 m from the drop-off point, photo taken',
    );
    expect(delivery.auditDetails).not.toHaveProperty('waitedForDispatch');
  });

  it('never dates a delivery in the future, whatever the sender clock says', () => {
    const later = new Date(Date.now() + 3_600_000).toISOString();
    const delivery = dispatchDeliveryFrom(completed(later), {
      ipAddress: null,
    });
    expect(delivery.deliveredAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('dates a delivery that waited for the warehouse from the moment of dispatch', () => {
    const dispatchedAt = new Date('2026-09-20T10:30:00Z');
    const delivery = dispatchDeliveryFrom(completed('2026-09-20T10:00:00Z'), {
      ipAddress: null,
      notBefore: dispatchedAt,
    });
    expect(delivery.deliveredAt).toEqual(dispatchedAt);
    expect(delivery.note).toMatch(
      /The driver completed it before the order was marked dispatched$/,
    );
    expect(delivery.auditDetails).toMatchObject({
      waitedForDispatch: true,
      proof: { capturedAt: '2026-09-20T10:00:00Z' },
    });
  });
});
