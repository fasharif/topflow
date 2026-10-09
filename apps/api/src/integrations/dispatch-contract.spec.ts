import {
  DISPATCH_EVENT_ID_HEADER,
  DISPATCH_EVENT_TYPE_HEADER,
  DISPATCH_SIGNATURE_HEADER,
  dispatchEventSchema,
} from '@topflow/shared';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { verifyDispatchSignature } from './dispatch-signature';

/**
 * The contract with the dispatch service, pinned by requests it really sent: dispatch's
 * end-to-end delivery flow recorded them, signed with its test secret, and both repositories keep
 * a byte-identical copy of the file (test/fixtures/README.md). If either side changes the
 * envelope, the signature format or a field limit, one of the two test suites fails.
 */
interface RecordedRequest {
  headers: Record<string, string>;
  body: string;
}
const fixture = JSON.parse(
  readFileSync(
    join(__dirname, '../../test/fixtures/dispatch-webhooks.recorded.json'),
    'utf8',
  ),
) as { secret: string; requests: RecordedRequest[] };

const timestampOf = (signature: string): number =>
  Number(/t=(\d+)/.exec(signature)?.[1]);

describe('recorded dispatch webhooks (contract)', () => {
  it('holds the assigned, picked-up and completed events of one delivery', () => {
    expect(
      fixture.requests.map((r) => r.headers[DISPATCH_EVENT_TYPE_HEADER]),
    ).toEqual([
      'delivery.assigned',
      'delivery.picked_up',
      'delivery.completed',
    ]);
  });

  it.each(
    fixture.requests.map(
      (r) => [r.headers[DISPATCH_EVENT_TYPE_HEADER], r] as const,
    ),
  )('%s: the signature verifies and the body parses', (_type, request) => {
    const signature = request.headers[DISPATCH_SIGNATURE_HEADER];
    const body = Buffer.from(request.body, 'utf8');
    const at = timestampOf(signature);
    expect(
      verifyDispatchSignature(signature, body, [fixture.secret], 300, at),
    ).toEqual({ valid: true, timestamp: at });
    expect(
      verifyDispatchSignature(signature, body, ['x'.repeat(40)], 300, at).valid,
    ).toBe(false);

    const event = dispatchEventSchema.parse(JSON.parse(request.body));
    expect(event.id).toBe(request.headers[DISPATCH_EVENT_ID_HEADER]);
    expect(event.type).toBe(request.headers[DISPATCH_EVENT_TYPE_HEADER]);
  });

  it('carries what TopFlow records for a completed delivery', () => {
    const completed = fixture.requests.find(
      (r) => r.headers[DISPATCH_EVENT_TYPE_HEADER] === 'delivery.completed',
    );
    const event = dispatchEventSchema.parse(JSON.parse(completed?.body ?? ''));
    expect(event.data.status).toBe('delivered');
    expect(event.data.driver?.name).toEqual(expect.any(String));
    expect(event.data.proof).toMatchObject({
      withinGeofence: true,
      hasPhoto: true,
      hasSignature: true,
    });
  });
});
