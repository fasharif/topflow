/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ApiError, errorMessage, isApiError, rateLimitMessage, SIGN_IN_REQUIRED_MESSAGE, toApiError } from './api-error';

// Run with `npm test -w mobile` (Node's test runner through tsx).

describe('toApiError', () => {
  it("keeps the API's message, code and field details", () => {
    const error = toApiError(409, {
      statusCode: 409,
      error: 'Conflict',
      message: 'Prices have changed since you opened your basket.',
      code: 'PRICE_CHANGED',
      details: [{ path: 'items.0.quantity', message: 'Too few' }, { path: 7 }, 'not a detail'],
    });

    assert.equal(error.status, 409);
    assert.equal(error.message, 'Prices have changed since you opened your basket.');
    assert.equal(error.code, 'PRICE_CHANGED');
    assert.deepEqual(error.details, [{ path: 'items.0.quantity', message: 'Too few' }]);
  });

  it('takes the first message when the body carries a list', () => {
    assert.equal(toApiError(400, { message: ['Enter a valid email address', 'Enter a phone number'] }).message, 'Enter a valid email address');
  });

  it('falls back to a message for the status when the body has none', () => {
    assert.equal(toApiError(401, undefined).message, SIGN_IN_REQUIRED_MESSAGE);
    assert.equal(toApiError(404, { message: '   ' }).message, 'We could not find what you were looking for.');
    assert.equal(toApiError(502, '<html>Bad gateway</html>').message, 'Top Flow is having trouble right now. Please try again shortly.');
    assert.equal(toApiError(418, {}).message, 'The request failed (418).');
  });

  it('leaves the code empty when the API sent none', () => {
    assert.equal(toApiError(403, { message: 'Forbidden' }).code, null);
    assert.deepEqual(toApiError(403, { message: 'Forbidden' }).details, []);
  });
});

describe('a 429 from the rate limiter', () => {
  // What the API answers when a client goes over its limit (@nestjs/throttler's default message).
  const body = { statusCode: 429, error: 'Too Many Requests', message: 'ThrottlerException: Too Many Requests' };

  it("shows a plain message with the wait from Retry-After instead of the API's text", () => {
    const error = toApiError(429, body, '42');

    assert.equal(error.status, 429);
    assert.equal(error.message, 'Too many requests. Please wait 42 seconds and try again.');
  });

  it('shows the plain message without a time when there is no Retry-After header', () => {
    assert.equal(toApiError(429, body).message, 'Too many requests. Please wait a moment and try again.');
    assert.equal(toApiError(429, undefined, null).message, 'Too many requests. Please wait a moment and try again.');
  });

  it('words the wait in seconds or in whole minutes, rounded up', () => {
    assert.equal(rateLimitMessage('1'), 'Too many requests. Please wait 1 second and try again.');
    assert.equal(rateLimitMessage('59'), 'Too many requests. Please wait 59 seconds and try again.');
    assert.equal(rateLimitMessage('60'), 'Too many requests. Please wait 1 minute and try again.');
    assert.equal(rateLimitMessage('61'), 'Too many requests. Please wait 2 minutes and try again.');
  });

  it('reads a Retry-After date, and ignores a value it cannot use', () => {
    const now = Date.parse('2026-10-04T10:00:00Z');
    assert.equal(rateLimitMessage('Sun, 04 Oct 2026 10:00:30 GMT', now), 'Too many requests. Please wait 30 seconds and try again.');
    for (const value of ['Sun, 04 Oct 2026 09:59:00 GMT', '0', '-5', 'soon', '']) {
      assert.equal(rateLimitMessage(value, now), 'Too many requests. Please wait a moment and try again.', value);
    }
  });
});

describe('isApiError and errorMessage', () => {
  it('recognises API errors, optionally by status', () => {
    const error = new ApiError(404, 'Not found');
    assert.equal(isApiError(error), true);
    assert.equal(isApiError(error, 404), true);
    assert.equal(isApiError(error, 401), false);
    assert.equal(isApiError(new Error('Not found'), 404), false);
  });

  it('gives a message for any thrown value', () => {
    assert.equal(errorMessage(new ApiError(0, 'Could not reach Top Flow.')), 'Could not reach Top Flow.');
    assert.equal(errorMessage('boom'), 'Something went wrong. Please try again.');
    assert.equal(errorMessage(null, 'Could not load your orders.'), 'Could not load your orders.');
  });
});
