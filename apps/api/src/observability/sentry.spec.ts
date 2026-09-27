import {
  initErrorReporting,
  reportServerError,
  sentryOptions,
  type ErrorReportingSdk,
} from './sentry';
import {
  DATA_COLLECTION,
  scrubBreadcrumb,
  scrubEvent,
  scrubSpan,
} from './sentry-config';

const DSN = 'https://0123456789abcdef@o123456.ingest.sentry.io/7654321';

function fakeSdk() {
  return {
    init: jest.fn(),
    captureException: jest.fn(),
  } as unknown as jest.Mocked<ErrorReportingSdk>;
}

describe('error reporting (Sentry)', () => {
  afterEach(() => {
    // Leave reporting switched off for the next test.
    initErrorReporting({}, fakeSdk());
  });

  it('stays off without SENTRY_DSN, also when the variable is empty', () => {
    expect(sentryOptions({})).toBeNull();
    expect(sentryOptions({ SENTRY_DSN: '' })).toBeNull();

    const sdk = fakeSdk();
    expect(initErrorReporting({ SENTRY_DSN: '' }, sdk)).toBe(false);
    expect(sdk.init).not.toHaveBeenCalled();
  });

  it('is a no-op for server errors when it is off', () => {
    const sdk = fakeSdk();
    initErrorReporting({}, sdk);
    reportServerError(new Error('boom'), { method: 'GET', path: '/orders' });
    expect(sdk.captureException).not.toHaveBeenCalled();
  });

  it('starts Sentry with the release, environment and no personal data', () => {
    const sdk = fakeSdk();
    const started = initErrorReporting(
      {
        SENTRY_DSN: DSN,
        NODE_ENV: 'production',
        APP_VERSION: 'sha-1a2b3c4',
        SENTRY_TRACES_SAMPLE_RATE: '0.2',
      },
      sdk,
    );
    expect(started).toBe(true);
    expect(sdk.init).toHaveBeenCalledWith({
      dsn: DSN,
      environment: 'production',
      release: 'sha-1a2b3c4',
      tracesSampleRate: 0.2,
      traceLifecycle: 'stream',
      dataCollection: DATA_COLLECTION,
      beforeSend: scrubEvent,
      beforeSendSpan: scrubSpan,
      beforeBreadcrumb: scrubBreadcrumb,
    });
  });

  it('turns off every kind of personal data the SDK would collect by default', () => {
    expect(DATA_COLLECTION).toMatchObject({
      userInfo: false,
      cookies: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
      httpHeaders: { response: false },
    });
  });

  it('strips credentials, client addresses, query strings and bodies from events', () => {
    const event = scrubEvent({
      request: {
        url: 'https://api.example.com/org/quotations?search=secret',
        headers: {
          Authorization: 'Bearer token',
          cookie: 'sb=1',
          'x-topflow-internal-auth': 'secret',
          'x-forwarded-for': '203.0.113.7',
          referer: 'https://hub.example.com/auth/confirm?token_hash=secret',
          'user-agent': 'Mozilla/5.0',
        },
        cookies: { sb: '1' },
        query_string: 'search=secret',
        data: { password: 'secret' },
      },
      user: { ip_address: '203.0.113.7' },
      contexts: {
        trace: {
          data: {
            'url.full': 'https://api.example.com/org/quotations?search=secret',
            'client.address': '203.0.113.7',
          },
        },
      },
    });
    expect(event).toEqual({
      request: {
        url: 'https://api.example.com/org/quotations',
        headers: { 'user-agent': 'Mozilla/5.0' },
      },
      contexts: {
        trace: {
          data: { 'url.full': 'https://api.example.com/org/quotations' },
        },
      },
    });
    expect(scrubEvent({})).toEqual({});
  });

  it('strips query strings, client addresses and private headers from spans', () => {
    const span = scrubSpan({
      name: 'GET /auth/confirm?token_hash=secret&type=recovery',
      attributes: {
        'sentry.op': 'http.server',
        'url.full': 'https://api.example.com/auth/confirm?token_hash=secret',
        'http.url': 'https://api.example.com/auth/confirm?token_hash=secret',
        'http.target': '/auth/confirm?token_hash=secret',
        'url.path': '/auth/confirm',
        'url.query': 'token_hash=secret',
        'http.query': 'token_hash=secret',
        'client.address': '203.0.113.7',
        'network.peer.address': '203.0.113.7',
        'http.request.header.cookie': ['sb=1'],
        'http.request.header.authorization': ['Bearer token'],
        'http.request.header.x-forwarded-for': ['203.0.113.7'],
        'http.request.header.user-agent': ['Mozilla/5.0'],
        'http.response.header.set-cookie': ['sb=2'],
        'http.request.body.data': '{"password":"secret"}',
        'http.request.body.size': 21,
        'sentry.segment.name': 'GET /auth/confirm?token_hash=secret',
        'user.name': 'someone',
        'db.query.text': 'SELECT * FROM "Product" WHERE id = ?',
        'http.response.status_code': 200,
      },
    });
    expect(span).toEqual({
      name: 'GET /auth/confirm',
      attributes: {
        'sentry.op': 'http.server',
        'url.full': 'https://api.example.com/auth/confirm',
        'http.url': 'https://api.example.com/auth/confirm',
        'http.target': '/auth/confirm',
        'url.path': '/auth/confirm',
        'http.request.header.user-agent': ['Mozilla/5.0'],
        'http.request.body.size': 21,
        'sentry.segment.name': 'GET /auth/confirm',
        'db.query.text': 'SELECT * FROM "Product" WHERE id = ?',
        'http.response.status_code': 200,
      },
    });
    expect(
      scrubSpan({
        name: 'GET https://project.supabase.co/auth/v1/user?email=a%40b.c',
      }),
    ).toEqual({ name: 'GET https://project.supabase.co/auth/v1/user' });
  });

  it('keeps query strings of outgoing calls and console output out of breadcrumbs', () => {
    expect(
      scrubBreadcrumb({
        category: 'http',
        data: {
          url: 'https://project.supabase.co/auth/v1/admin/users?email=someone%40example.com#top',
          method: 'GET',
          status_code: 200,
          'http.query': 'email=someone%40example.com',
          'http.fragment': 'top',
        },
      }),
    ).toEqual({
      category: 'http',
      data: {
        url: 'https://project.supabase.co/auth/v1/admin/users',
        method: 'GET',
        status_code: 200,
      },
    });
    expect(
      scrubBreadcrumb({
        category: 'console',
        message: 'Quote request from someone@example.com',
      }),
    ).toBeNull();
    expect(scrubBreadcrumb({ category: 'navigation' })).toEqual({
      category: 'navigation',
    });
  });

  it('prefers SENTRY_ENVIRONMENT and traces nothing by default', () => {
    expect(
      sentryOptions({ SENTRY_DSN: DSN, SENTRY_ENVIRONMENT: 'staging' }),
    ).toMatchObject({ environment: 'staging', tracesSampleRate: 0 });
  });

  it('reports server errors with the request id but without the query string', () => {
    const sdk = fakeSdk();
    initErrorReporting({ SENTRY_DSN: DSN }, sdk);
    const error = new Error('database unavailable');
    reportServerError(error, {
      requestId: 'req-42',
      method: 'POST',
      path: '/quote-requests',
    });
    expect(sdk.captureException).toHaveBeenCalledWith(error, {
      tags: { requestId: 'req-42' },
      extra: { method: 'POST', path: '/quote-requests' },
    });
  });

  it('rejects a malformed DSN or sample rate with a readable message', () => {
    expect(() => sentryOptions({ SENTRY_DSN: 'not a url' })).toThrow(
      /SENTRY_DSN/,
    );
    // The SDK itself would ignore these, leaving reporting silently off.
    expect(() =>
      sentryOptions({ SENTRY_DSN: 'https://public-key@host/1' }),
    ).toThrow(/SENTRY_DSN/);
    expect(() =>
      sentryOptions({ SENTRY_DSN: 'https://key@host/project' }),
    ).toThrow(/SENTRY_DSN/);
    expect(() =>
      sentryOptions({ SENTRY_DSN: DSN, SENTRY_TRACES_SAMPLE_RATE: '2' }),
    ).toThrow(/SENTRY_TRACES_SAMPLE_RATE/);
  });
});
