import * as Sentry from '@sentry/nextjs';
import { reportRequestError, startErrorReporting, type ErrorReportingSdk } from './sentry';

/**
 * Runs the real Sentry SDK for Next.js with the web server's options, through the same
 * startErrorReporting / onRequestError path as instrumentation.ts, and a transport that records
 * what would be sent. It checks that the settings take effect in the installed SDK version.
 */

const DSN = 'https://0123456789abcdef@o123456.ingest.sentry.io/7654321';

/** Values that must never leave the server. */
const SECRETS = ['token_hash', 'recovery', 'someone%40example.com', '203.0.113.7', 'sb-access-token', 'internal-secret'];

function itemTypes(envelopes: unknown[]): string[] {
  return envelopes.flatMap((envelope) => {
    const [, items] = envelope as [unknown, [{ type: string }, unknown][]];
    return items.map(([header]) => header.type);
  });
}

describe('web error reporting with the real Sentry SDK', () => {
  const envelopes: unknown[] = [];

  beforeAll(async () => {
    // The real SDK, with a recording transport and only the integration that attaches request
    // details, so the test does not instrument Jest.
    const sdk: ErrorReportingSdk = {
      init: (options) =>
        Sentry.init({
          ...(options as Sentry.NodeOptions),
          defaultIntegrations: false,
          integrations: [Sentry.requestDataIntegration()],
          transport: () => ({
            send: (envelope: unknown) => {
              envelopes.push(envelope);
              return Promise.resolve({ statusCode: 200 });
            },
            flush: () => Promise.resolve(true),
          }),
        }),
      captureRequestError: (error, request, context) => Sentry.captureRequestError(error, request, context),
    };
    const started = await startErrorReporting({ SENTRY_DSN: DSN, SENTRY_TRACES_SAMPLE_RATE: '1', NODE_ENV: 'test' }, async () => sdk);
    expect(started).toBe(true);
  });

  afterAll(async () => {
    await Sentry.close(2000);
  });

  it('sends server errors and spans without query strings, cookies, credentials or addresses', async () => {
    Sentry.startSpan(
      {
        name: 'GET /auth/confirm?token_hash=abc&type=recovery',
        attributes: {
          'sentry.segment.name.source': 'url',
          'http.target': '/auth/confirm?token_hash=abc&type=recovery',
          'http.client_ip': '203.0.113.7',
          'http.request.header.cookie': ['sb-access-token=abc'],
        },
      },
      () => {
        reportRequestError(
          new Error('render failed'),
          {
            path: '/auth/confirm?token_hash=abc&type=recovery',
            method: 'GET',
            headers: {
              cookie: 'sb-access-token=abc',
              'x-topflow-internal-auth': 'internal-secret',
              'x-forwarded-for': '203.0.113.7',
              referer: 'https://hub.example.com/account?email=someone%40example.com',
              'user-agent': 'jest',
            },
          },
          { routerKind: 'App Router', routePath: '/auth/confirm', routeType: 'route', revalidateReason: undefined, renderSource: undefined },
        );
      },
    );
    await Sentry.flush(2000);

    expect(itemTypes(envelopes)).toEqual(expect.arrayContaining(['event', 'span']));
    const payload = JSON.stringify(envelopes);
    expect(payload).toContain('render failed');
    expect(payload).toContain('/auth/confirm');
    expect(payload).toContain('user-agent');
    for (const secret of SECRETS) expect(payload).not.toContain(secret);
  });
});
