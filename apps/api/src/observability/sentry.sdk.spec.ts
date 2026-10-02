import * as Sentry from '@sentry/nestjs';
import { sentryOptions } from './sentry-config';

/**
 * Runs the real Sentry SDK with the API's options and a transport that records what would be
 * sent, instead of a fake SDK. It checks that the settings take effect in the installed SDK
 * version: a renamed or removed option (Sentry 11 dropped `sendDefaultPii`, for example) fails
 * here.
 */

const DSN = 'https://0123456789abcdef@o123456.ingest.sentry.io/7654321';

/** Values that must never leave the process. */
const SECRETS = [
  'token_hash',
  'recovery',
  'someone%40example.com',
  'someone@example.com',
  '203.0.113.7',
  'sb-access-token',
  'Bearer',
  'internal-secret',
  'hunter2',
];

/** The item types (event, span, ...) of the envelopes the transport received. */
function itemTypes(envelopes: unknown[]): string[] {
  return envelopes.flatMap((envelope) => {
    const [, items] = envelope as [unknown, [{ type: string }, unknown][]];
    return items.map(([header]) => header.type);
  });
}

describe('error reporting with the real Sentry SDK', () => {
  const envelopes: unknown[] = [];

  beforeAll(() => {
    const options = sentryOptions({
      SENTRY_DSN: DSN,
      SENTRY_TRACES_SAMPLE_RATE: '1',
      NODE_ENV: 'test',
    });
    if (!options) throw new Error('expected Sentry options');
    Sentry.init({
      ...options,
      // Only the integration that attaches request details, so the test does not instrument Jest.
      defaultIntegrations: false,
      integrations: [Sentry.requestDataIntegration()],
      transport: () => ({
        send: (envelope) => {
          envelopes.push(envelope);
          return Promise.resolve({ statusCode: 200 });
        },
        flush: () => Promise.resolve(true),
      }),
    });
  });

  afterAll(async () => {
    await Sentry.close(2000);
  });

  it('sends errors and spans without query strings, cookies, bodies, credentials or addresses', async () => {
    Sentry.withIsolationScope((scope) => {
      // What the HTTP instrumentation records about an incoming request.
      scope.setSDKProcessingMetadata({
        normalizedRequest: {
          method: 'POST',
          url: 'https://api.example.com/auth/confirm?token_hash=abc&type=recovery',
          query_string: 'token_hash=abc&type=recovery',
          headers: {
            cookie: 'sb-access-token=abc',
            authorization: 'Bearer abc',
            'x-topflow-internal-auth': 'internal-secret',
            'x-forwarded-for': '203.0.113.7',
            'user-agent': 'jest',
          },
          cookies: { 'sb-access-token': 'abc' },
          data: { password: 'hunter2' },
        },
        ipAddress: '203.0.113.7',
      });
      Sentry.addBreadcrumb({
        category: 'http',
        data: {
          url: 'https://project.supabase.co/auth/v1/admin/users?email=someone%40example.com',
          method: 'GET',
        },
      });
      Sentry.addBreadcrumb({
        category: 'console',
        message: 'Quote request from someone@example.com',
      });
      // A request's root span named from its URL, as the HTTP instrumentation does before the
      // route is known ('url' source: the SDK then leaves the name out of the envelope header).
      Sentry.startSpan(
        {
          name: 'POST /auth/confirm?token_hash=abc&type=recovery',
          attributes: {
            'sentry.segment.name.source': 'url',
            'url.full':
              'https://api.example.com/auth/confirm?token_hash=abc&type=recovery',
            'url.query': 'token_hash=abc&type=recovery',
            'client.address': '203.0.113.7',
            'http.request.header.cookie': ['sb-access-token=abc'],
          },
        },
        () => {
          Sentry.startSpan(
            {
              name: 'GET https://project.supabase.co/auth/v1/admin/users?email=someone%40example.com',
              attributes: {
                'http.url':
                  'https://project.supabase.co/auth/v1/admin/users?email=someone%40example.com',
                'http.request.header.authorization': ['Bearer abc'],
              },
            },
            () => undefined,
          );
          Sentry.captureException(new Error('database unavailable'));
        },
      );
    });
    await Sentry.flush(2000);

    // The error and both spans were sent, with what is safe to keep.
    expect(itemTypes(envelopes)).toEqual(
      expect.arrayContaining(['event', 'span']),
    );
    const payload = JSON.stringify(envelopes);
    expect(payload).toContain('database unavailable');
    expect(payload).toContain('"https://api.example.com/auth/confirm"');
    expect(payload).toContain('"POST /auth/confirm"');
    expect(payload).toContain(
      '"https://project.supabase.co/auth/v1/admin/users"',
    );
    expect(payload).toContain('user-agent');
    for (const secret of SECRETS) expect(payload).not.toContain(secret);
  });
});
