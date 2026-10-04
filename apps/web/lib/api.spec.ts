import { ApiError, api, rateLimitMessage } from './api';

/*
 * The browser's API helper against a stand-in for fetch. The Server Actions that session.ts imports
 * are replaced, because they need Next's request context.
 */

jest.mock('@/lib/auth/actions', () => ({ signOut: jest.fn(() => Promise.resolve()) }));

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as typeof fetch;
});

function answer(status: number, body: unknown, headers: Record<string, string> = {}): void {
  fetchMock.mockResolvedValue(Response.json(body, { status, headers }));
}

async function failure(call: Promise<unknown>): Promise<ApiError> {
  const error = await call.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  if (!(error instanceof ApiError)) throw new Error('Expected the call to fail with an ApiError');
  return error;
}

describe('a 429 from the rate limiter', () => {
  // What the API answers when a client goes over its limit (@nestjs/throttler's default message).
  const body = { statusCode: 429, error: 'Too Many Requests', message: 'ThrottlerException: Too Many Requests' };

  it("shows a plain message with the wait from Retry-After instead of the API's text", async () => {
    answer(429, body, { 'retry-after': '42' });

    const error = await failure(api('/quote-requests', { method: 'POST', body: {} }));

    expect(error.status).toBe(429);
    expect(error.message).toBe('Too many requests. Please wait 42 seconds and try again.');
  });

  it('shows the plain message without a time when there is no Retry-After header', async () => {
    answer(429, body);

    const error = await failure(api('/catalog/products'));

    expect(error.message).toBe('Too many requests. Please wait a moment and try again.');
  });

  it('words the wait in seconds or in whole minutes, rounded up', () => {
    expect(rateLimitMessage('1')).toBe('Too many requests. Please wait 1 second and try again.');
    expect(rateLimitMessage('59')).toBe('Too many requests. Please wait 59 seconds and try again.');
    expect(rateLimitMessage('60')).toBe('Too many requests. Please wait 1 minute and try again.');
    expect(rateLimitMessage('61')).toBe('Too many requests. Please wait 2 minutes and try again.');
  });

  it('reads a Retry-After date, and ignores a value it cannot use', () => {
    const now = Date.parse('2026-10-04T10:00:00Z');
    expect(rateLimitMessage('Sun, 04 Oct 2026 10:00:30 GMT', now)).toBe('Too many requests. Please wait 30 seconds and try again.');
    for (const value of ['Sun, 04 Oct 2026 09:59:00 GMT', '0', '-5', 'soon', '', null]) {
      expect(rateLimitMessage(value, now)).toBe('Too many requests. Please wait a moment and try again.');
    }
  });
});

describe('other failures', () => {
  it("keep the API's message, code and field details", async () => {
    answer(400, {
      statusCode: 400,
      error: 'Bad Request',
      message: 'Enter a valid email address',
      code: 'VALIDATION',
      details: [{ path: 'email', message: 'Enter a valid email address' }],
    });

    const error = await failure(api('/quote-requests', { method: 'POST', body: {} }));

    expect(error.message).toBe('Enter a valid email address');
    expect(error.code).toBe('VALIDATION');
    expect(error.fieldErrors()).toEqual({ email: 'Enter a valid email address' });
  });
});
