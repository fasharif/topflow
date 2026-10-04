import { Logger } from '@nestjs/common';
import { dispatchEvent, signDispatchBody } from './support/dispatch';
import { E2eHarness } from './support/harness';

/**
 * The dispatch webhook endpoint in two configurations the main suite does not run in: switched
 * off (no DISPATCH_WEBHOOK_SECRET, which is how every deployment starts), and with a rate limit
 * a test can reach (setup-env.ts raises it for the other suites). Each block starts its own
 * application, because the configuration is read once at start.
 */
describe('dispatch webhook endpoint (e2e)', () => {
  const ENDPOINT = '/integrations/dispatch/events';
  const secret = process.env.DISPATCH_WEBHOOK_SECRET ?? '';
  const event = dispatchEvent('delivery.completed', 'TF-SO-2026-000001');
  const body = JSON.stringify(event);

  describe('without DISPATCH_WEBHOOK_SECRET', () => {
    const harness = new E2eHarness();

    beforeAll(async () => {
      delete process.env.DISPATCH_WEBHOOK_SECRET;
      await harness.start();
    });

    afterAll(async () => {
      await harness.stop();
    });

    it('answers 503 to every request, signed or not, and records nothing', async () => {
      const before = await harness.prisma.dispatchEvent.count();
      const signed = await harness
        .http()
        .post(ENDPOINT)
        .set('content-type', 'application/json')
        .set('x-dispatch-event-id', event.id)
        .set('x-dispatch-signature', signDispatchBody(secret, body))
        .send(body)
        .expect(503);
      // 503 is an answer the dispatch service retries; a 4xx would end in its failed list.
      expect(signed.body).toMatchObject({
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'The dispatch integration is not configured',
        code: 'INTEGRATION_DISABLED',
      });
      await harness.http().post(ENDPOINT).expect(503);
      expect(await harness.prisma.dispatchEvent.count()).toBe(before);
    });

    it('logs the refusal as a warning and not as a server error', async () => {
      const error = jest.spyOn(Logger.prototype, 'error');
      const warn = jest.spyOn(Logger.prototype, 'warn');
      try {
        await harness.http().post(`${ENDPOINT}?probe=1`).expect(503);
        expect(error).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith(
          expect.stringMatching(
            /^POST \/integrations\/dispatch\/events → 503: The dispatch integration is not configured \[[\w-]+\]$/,
          ),
        );
      } finally {
        error.mockRestore();
        warn.mockRestore();
      }
    });
  });

  describe('with a rate limit a test can reach', () => {
    const LIMIT = 12;
    const harness = new E2eHarness();

    beforeAll(async () => {
      process.env.DISPATCH_WEBHOOK_SECRET = secret;
      process.env.THROTTLE_LIMIT = String(LIMIT);
      await harness.start();
    });

    afterAll(async () => {
      await harness.stop();
    });

    it('limits a client that keeps sending requests, before their signature is checked', async () => {
      // Unsigned requests cost the API one refusal each, up to the per-client limit.
      for (let sent = 0; sent < LIMIT; sent += 1) {
        const refused = await harness
          .http()
          .post(ENDPOINT)
          .set('content-type', 'application/json')
          .send(body)
          .expect(401);
        expect(refused.body).toMatchObject({ code: 'INVALID_SIGNATURE' });
      }
      const limited = await harness
        .http()
        .post(ENDPOINT)
        .set('content-type', 'application/json')
        .send(body)
        .expect(429);
      expect(limited.body).toMatchObject({ statusCode: 429 });
      expect(limited.headers['retry-after']).toBeDefined();

      // The limit is per client address, so a correctly signed event from that address waits too.
      // 429 is an answer the dispatch service retries.
      await harness
        .http()
        .post(ENDPOINT)
        .set('content-type', 'application/json')
        .set('x-dispatch-event-id', event.id)
        .set('x-dispatch-signature', signDispatchBody(secret, body))
        .send(body)
        .expect(429);
      expect(
        await harness.prisma.dispatchEvent.count({ where: { id: event.id } }),
      ).toBe(0);
    });
  });
});
