import {
  initErrorReporting,
  reportServerError,
  sentryOptions,
  type ErrorReportingSdk,
} from './sentry';

const DSN = 'https://public-key@o123456.ingest.sentry.io/7654321';

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
    expect(() =>
      sentryOptions({ SENTRY_DSN: DSN, SENTRY_TRACES_SAMPLE_RATE: '2' }),
    ).toThrow(/SENTRY_TRACES_SAMPLE_RATE/);
  });
});
