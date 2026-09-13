import 'server-only';
import type { ApiErrorBody } from '@topflow/shared';

const API_ORIGIN = (process.env.API_INTERNAL_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export class ServerApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Server Component data access for public, cacheable data (catalog, categories). Talks to the
 * API directly over the private network; responses are cached and revalidated in the background.
 */
export async function serverApi<T>(path: string, options: { revalidate?: number; searchParams?: URLSearchParams } = {}): Promise<T> {
  const query = options.searchParams?.toString();
  const response = await fetch(`${API_ORIGIN}${path}${query ? `?${query}` : ''}`, {
    headers: { accept: 'application/json' },
    next: { revalidate: options.revalidate ?? 60 },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as Partial<ApiErrorBody>;
    throw new ServerApiError(response.status, body.message ?? `API request failed (${response.status})`);
  }
  return (await response.json()) as T;
}
