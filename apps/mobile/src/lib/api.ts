import { ApiError, request, type HttpMethod, type QueryParams } from '@/lib/http';
import { getAccessToken, refreshSession } from '@/lib/session';

export { ApiError, errorMessage, isApiError } from '@/lib/http';

export interface ApiOptions {
  method?: HttpMethod;
  /** Serialised as JSON. */
  body?: unknown;
  query?: QueryParams;
  /**
   * Sends `authorization: Bearer <accessToken>`. When the API answers 401 the session is
   * refreshed once (shared with any concurrent callers) and the request is replayed.
   */
  auth?: boolean;
  signal?: AbortSignal;
}

const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please sign in again.';

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { auth = false, ...rest } = options;
  if (!auth) return request<T>(path, rest);

  const token = getAccessToken() ?? (await refreshedAccessToken());
  try {
    return await request<T>(path, { ...rest, accessToken: token });
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    // A concurrent request may already have rotated the session while this one was in flight.
    const current = getAccessToken();
    const next = current && current !== token ? current : await refreshedAccessToken();
    return request<T>(path, { ...rest, accessToken: next });
  }
}

async function refreshedAccessToken(): Promise<string> {
  const outcome = await refreshSession();
  const token = getAccessToken();
  if (outcome !== 'refreshed' || !token) {
    throw new ApiError(401, SESSION_EXPIRED_MESSAGE);
  }
  return token;
}
