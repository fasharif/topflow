import { redactRequest, reportRequestError, scrubEvent, sentryOptions, startErrorReporting, type ErrorContext, type ErrorReportingSdk, type ErrorRequest } from './sentry';

const DSN = 'https://public-key@o123456.ingest.sentry.io/7654321';

const request: ErrorRequest = {
  path: '/account/orders?page=2&email=someone%40example.com',
  method: 'GET',
  headers: {
    accept: 'text/html',
    cookie: 'sb-access-token=secret',
    authorization: 'Bearer secret',
    'x-topflow-internal-auth': 'secret',
    'x-forwarded-for': '203.0.113.7',
  },
};

const context: ErrorContext = {
  routerKind: 'App Router',
  routePath: '/account/orders',
  routeType: 'render',
  renderSource: 'server-rendering',
  revalidateReason: undefined,
};

function fakeSdk(): jest.Mocked<ErrorReportingSdk> {
  return { init: jest.fn(), captureRequestError: jest.fn() };
}

describe('web error reporting (Sentry)', () => {
  afterEach(async () => {
    await startErrorReporting({});
  });

  it('never loads the SDK without SENTRY_DSN, and reporting is a no-op', async () => {
    const load = jest.fn(async () => fakeSdk());
    await expect(startErrorReporting({ SENTRY_DSN: '' }, load)).resolves.toBe(false);
    await expect(startErrorReporting({}, load)).resolves.toBe(false);
    expect(load).not.toHaveBeenCalled();
    expect(() => reportRequestError(new Error('boom'), request, context)).not.toThrow();
  });

  it('starts Sentry with the runtime environment and release, without personal data', async () => {
    const sdk = fakeSdk();
    const started = await startErrorReporting(
      { SENTRY_DSN: DSN, NODE_ENV: 'production', SENTRY_ENVIRONMENT: 'staging', APP_VERSION: 'sha-1a2b3c4' },
      async () => sdk,
    );
    expect(started).toBe(true);
    expect(sdk.init).toHaveBeenCalledWith({
      dsn: DSN,
      environment: 'staging',
      release: 'sha-1a2b3c4',
      tracesSampleRate: 0,
      sendDefaultPii: false,
      beforeSend: scrubEvent,
    });
  });

  it('strips credentials, client addresses, query strings and bodies from any event', () => {
    const event = scrubEvent({
      request: {
        url: 'https://hub.example.com/checkout?coupon=secret',
        headers: { Cookie: 'sb=1', authorization: 'Bearer token', 'x-real-ip': '203.0.113.7', accept: 'text/html' },
        cookies: { sb: '1' },
        query_string: 'coupon=secret',
        data: { password: 'secret' },
      },
    });
    expect(event.request).toEqual({ url: 'https://hub.example.com/checkout', headers: { accept: 'text/html' } });
  });

  it('reports server errors without the query string, cookies or secrets', async () => {
    const sdk = fakeSdk();
    await startErrorReporting({ SENTRY_DSN: DSN }, async () => sdk);
    const error = new Error('API unreachable');
    reportRequestError(error, request, context);
    expect(sdk.captureRequestError).toHaveBeenCalledWith(error, { path: '/account/orders', method: 'GET', headers: { accept: 'text/html' } }, context);
  });

  it('keeps the original request untouched when redacting', () => {
    redactRequest(request);
    expect(request.headers.cookie).toBe('sb-access-token=secret');
  });

  it('rejects a malformed DSN or sample rate with a readable message', () => {
    expect(() => sentryOptions({ SENTRY_DSN: 'sentry' })).toThrow(/SENTRY_DSN/);
    expect(() => sentryOptions({ SENTRY_DSN: 'ftp://key@host/1' })).toThrow(/SENTRY_DSN/);
    expect(() => sentryOptions({ SENTRY_DSN: DSN, SENTRY_TRACES_SAMPLE_RATE: '1.5' })).toThrow(/SENTRY_TRACES_SAMPLE_RATE/);
    expect(sentryOptions({ SENTRY_DSN: DSN, SENTRY_TRACES_SAMPLE_RATE: '0.1' })?.tracesSampleRate).toBe(0.1);
  });
});
