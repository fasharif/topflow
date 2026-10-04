/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ApiError, errorMessage, isApiError, SIGN_IN_REQUIRED_MESSAGE, toApiError } from './api-error';

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
