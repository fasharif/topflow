import {
  DATA_COLLECTION,
  redactRequest,
  reportRequestError,
  scrubBreadcrumb,
  scrubEvent,
  scrubSpan,
  sentryOptions,
  startErrorReporting,
  type ErrorContext,
  type ErrorReportingSdk,
  type ErrorRequest,
} from './sentry';

const DSN = 'https://0123456789abcdef@o123456.ingest.sentry.io/7654321';

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
      traceLifecycle: 'stream',
      dataCollection: DATA_COLLECTION,
      beforeSend: scrubEvent,
      beforeSendSpan: scrubSpan,
      beforeBreadcrumb: scrubBreadcrumb,
    });
    expect(DATA_COLLECTION).toMatchObject({ userInfo: false, cookies: false, httpBodies: [], urlQueryParams: false, stackFrameVariables: false });
  });

  it('strips query strings, client addresses and private headers from spans (tracing on)', () => {
    const span = scrubSpan({
      name: 'GET /auth/confirm?token_hash=secret&type=recovery',
      attributes: {
        'http.target': '/auth/confirm?token_hash=secret&type=recovery',
        'http.url': 'https://hub.example.com/auth/confirm?token_hash=secret',
        'next.route': '/auth/confirm',
        'url.query': 'token_hash=secret',
        'http.client_ip': '203.0.113.7',
        'http.request.header.cookie': ['sb-access-token=secret'],
        'http.request.header.accept': ['text/html'],
        'http.request.body.data': 'email=someone%40example.com',
        'sentry.segment.name': 'GET /auth/confirm?token_hash=secret',
      },
    });
    expect(span).toEqual({
      name: 'GET /auth/confirm',
      attributes: {
        'http.target': '/auth/confirm',
        'http.url': 'https://hub.example.com/auth/confirm',
        'next.route': '/auth/confirm',
        'http.request.header.accept': ['text/html'],
        'sentry.segment.name': 'GET /auth/confirm',
      },
    });
  });

  it('keeps query strings of outgoing calls and console output out of breadcrumbs', () => {
    expect(
      scrubBreadcrumb({
        category: 'fetch',
        data: { url: 'http://api:3000/catalog/products?search=rotor&page=2', method: 'GET', 'http.query': 'search=rotor&page=2' },
      }),
    ).toEqual({ category: 'fetch', data: { url: 'http://api:3000/catalog/products', method: 'GET' } });
    expect(scrubBreadcrumb({ category: 'console', message: 'Sign-in failed for someone@example.com' })).toBeNull();
  });

  it('strips credentials, client addresses, query strings and bodies from any event', () => {
    const event = scrubEvent({
      request: {
        url: 'https://hub.example.com/checkout?coupon=secret',
        headers: { Cookie: 'sb=1', authorization: 'Bearer token', 'x-real-ip': '203.0.113.7', referer: 'https://hub.example.com/?token=1', accept: 'text/html' },
        cookies: { sb: '1' },
        query_string: 'coupon=secret',
        data: { password: 'secret' },
      },
      user: { ip_address: '203.0.113.7' },
    });
    expect(event).toEqual({ request: { url: 'https://hub.example.com/checkout', headers: { accept: 'text/html' } } });
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
    // The SDK itself would ignore these, leaving reporting silently off.
    expect(() => sentryOptions({ SENTRY_DSN: 'https://public-key@host/1' })).toThrow(/SENTRY_DSN/);
    expect(() => sentryOptions({ SENTRY_DSN: 'https://key@host/project' })).toThrow(/SENTRY_DSN/);
    expect(() => sentryOptions({ SENTRY_DSN: DSN, SENTRY_TRACES_SAMPLE_RATE: '1.5' })).toThrow(/SENTRY_TRACES_SAMPLE_RATE/);
    expect(sentryOptions({ SENTRY_DSN: DSN, SENTRY_TRACES_SAMPLE_RATE: '0.1' })?.tracesSampleRate).toBe(0.1);
  });
});
