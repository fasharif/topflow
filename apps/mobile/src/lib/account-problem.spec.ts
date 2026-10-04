/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ErrorCode } from '@topflow/shared';

import { ACCOUNT_CONFLICT_MESSAGE, ACCOUNT_DISABLED_MESSAGE, accountRefusalMessage } from './account-problem';
import { ApiError, SESSION_EXPIRED_MESSAGE } from './api-error';

// Run with `npm test -w mobile` (Node's test runner through tsx; needs @topflow/shared built).

describe('accountRefusalMessage', () => {
  it('explains a disabled account, which the API refuses with 401 ACCOUNT_DISABLED', () => {
    // As http.ts reports a rejected token: its own message, with the API's code kept.
    const error = new ApiError(401, SESSION_EXPIRED_MESSAGE, { code: ErrorCode.ACCOUNT_DISABLED });

    assert.equal(accountRefusalMessage(error), 'Your Top Flow account has been disabled. Please contact us for help.');
    assert.equal(accountRefusalMessage(error), ACCOUNT_DISABLED_MESSAGE);
  });

  it('explains an email address that belongs to another account (409 ACCOUNT_CONFLICT)', () => {
    const error = new ApiError(409, 'This email address is linked to another Top Flow account. Please contact us.', {
      code: ErrorCode.ACCOUNT_CONFLICT,
    });

    assert.equal(accountRefusalMessage(error), ACCOUNT_CONFLICT_MESSAGE);
  });

  it('keeps the message of a session that simply ended', () => {
    assert.equal(accountRefusalMessage(new ApiError(401, SESSION_EXPIRED_MESSAGE)), SESSION_EXPIRED_MESSAGE);
  });

  it("keeps the API's message for another refusal", () => {
    assert.equal(accountRefusalMessage(new ApiError(403, 'You do not have access to this.')), 'You do not have access to this.');
  });

  it('is not a refusal when the API could not be reached or failed', () => {
    assert.equal(accountRefusalMessage(new ApiError(0, 'Could not reach Top Flow. Check your connection and try again.')), null);
    assert.equal(accountRefusalMessage(new ApiError(503, 'Top Flow is having trouble right now. Please try again shortly.')), null);
    assert.equal(accountRefusalMessage(new ApiError(429, 'Too many requests. Please wait a moment and try again.')), null);
    assert.equal(accountRefusalMessage(new Error('boom')), null);
  });
});
