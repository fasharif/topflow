import { request, type AuthMode, type HttpMethod, type QueryParams } from '@/lib/http';

export { ApiError, errorMessage, isApiError } from '@/lib/http';

export interface ApiOptions {
  method?: HttpMethod;
  /** Serialised as JSON. */
  body?: unknown;
  query?: QueryParams;
  /**
   * `true` sends `Authorization: Bearer <Supabase access token>` and needs a signed-in customer;
   * `'optional'` sends it only when signed in. When the API rejects the token, the app signs out on
   * this device (see `http.ts`).
   */
  auth?: AuthMode;
  signal?: AbortSignal;
}

/** Calls the Top Flow API. */
export function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  return request<T>(path, options);
}
