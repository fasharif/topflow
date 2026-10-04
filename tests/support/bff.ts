import type { APIRequestContext, APIResponse } from '@playwright/test';
import { ORGANIZATION_HEADER, type ApiErrorBody, type AuthUser } from '@topflow/shared';
import { stack } from './env';

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface BffRequest {
  body?: unknown;
  /** Act inside this organization (the trade portal's x-organization-id header). */
  organizationId?: string;
  query?: Record<string, string | number>;
  /** Extra headers, for example a foreign Origin to test cross-site protection. */
  headers?: Record<string, string>;
}

/**
 * Calls the API the way the browser does: through the web app's /api handler, with the session
 * cookies of the signed-in role. The handler adds the Supabase token, so the whole production path
 * (proxy, session refresh, API guards) is exercised. Used for set-up and for assertions a page
 * does not show; journeys themselves go through the UI.
 */
export class BffClient {
  constructor(private readonly request: APIRequestContext) {}

  /** Raw response, for status-code assertions. */
  send(method: Method, path: string, options: BffRequest = {}): Promise<APIResponse> {
    const headers: Record<string, string> = { accept: 'application/json', ...options.headers };
    if (options.organizationId) headers[ORGANIZATION_HEADER] = options.organizationId;
    if (method !== 'GET' && !headers.origin) headers.origin = stack.webUrl;
    return this.request.fetch(`${stack.webUrl}/api${path}`, {
      method,
      headers,
      params: options.query,
      data: options.body,
      failOnStatusCode: false,
    });
  }

  /** JSON body of a successful call; any other status fails with the API's own message. */
  async json<T>(method: Method, path: string, options: BffRequest = {}): Promise<T> {
    const response = await this.send(method, path, options);
    if (!response.ok()) {
      const body = (await response.json().catch(() => ({}))) as Partial<ApiErrorBody>;
      throw new Error(`${method} /api${path} answered ${response.status()}: ${body.message ?? response.statusText()}`);
    }
    return (await response.json()) as T;
  }

  get<T>(path: string, options?: BffRequest): Promise<T> {
    return this.json<T>('GET', path, options);
  }

  me(): Promise<AuthUser> {
    return this.get<AuthUser>('/auth/me');
  }

  /** The first organization the signed-in user belongs to (the trade portal's default). */
  async organizationId(): Promise<string> {
    const membership = (await this.me()).memberships[0];
    if (!membership) throw new Error('The signed-in user belongs to no organization');
    return membership.organizationId;
  }
}
