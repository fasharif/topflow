import {
  initErrorReporting,
  reportServerError,
  sentryOptions,
  type ErrorReportingSdk,
} from './sentry';
import { scrubBreadcrumb, scrubEvent } from './sentry-config';

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
      sendDefaultPii: false,
      beforeSend: scrubEvent,
      beforeBreadcrumb: scrubBreadcrumb,
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
          'user-agent': 'Mozilla/5.0',
        },
        cookies: { sb: '1' },
        query_string: 'search=secret',
        data: { password: 'secret' },
      },
    });
    expect(event.request).toEqual({
      url: 'https://api.example.com/org/quotations',
      headers: { 'user-agent': 'Mozilla/5.0' },
    });
    expect(scrubEvent({})).toEqual({});
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
