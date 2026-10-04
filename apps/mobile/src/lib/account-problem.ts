import { ErrorCode } from '@topflow/shared';

import { isApiError } from './api-error';

/**
 * What to tell a customer whose signed-in identity the API refuses when the session store loads
 * `GET /auth/me`. Kept free of React Native so it can be unit tested with Node
 * (account-problem.spec.ts).
 */

export const ACCOUNT_DISABLED_MESSAGE = 'Your Top Flow account has been disabled. Please contact us for help.';
export const ACCOUNT_CONFLICT_MESSAGE = 'This email address is linked to a different Top Flow account. Please contact us for help.';

/**
 * The reason to show when the API refused the identity, or `null` when the failure says nothing
 * about the account (offline, a timeout, a server error) and the session should be kept.
 *
 * The API answers 401 `ACCOUNT_DISABLED` for a disabled account and 409 `ACCOUNT_CONFLICT` for an
 * email address that belongs to another account. For a 401, `http.ts` reports "Your session has
 * expired" and keeps the API's code, so the code decides the message, not the status.
 */
export function accountRefusalMessage(error: unknown): string | null {
  if (!isApiError(error)) return null;
  if (error.status !== 401 && error.status !== 403 && error.status !== 409) return null;
  if (error.code === ErrorCode.ACCOUNT_DISABLED) return ACCOUNT_DISABLED_MESSAGE;
  if (error.code === ErrorCode.ACCOUNT_CONFLICT) return ACCOUNT_CONFLICT_MESSAGE;
  return error.message;
}
