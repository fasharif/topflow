'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, errorMessage } from './api';
import { useSession } from './session';

type QueryValue = string | number | boolean | null | undefined;

export interface ApiQueryOptions {
  query?: Record<string, QueryValue>;
  /** Scope the request to the active organization. */
  org?: boolean;
  /** Public endpoints don't wait for the session to load. */
  public?: boolean;
}

interface QueryResult<T> {
  key: string | null;
  data?: T;
  error?: ApiError;
}

/**
 * Minimal data-fetching hook: waits for the session, refetches when the path, query or
 * active organization changes, cancels stale requests, and keeps the previous data visible
 * while a new page loads.
 */
export function useApiQuery<T>(path: string | null, options: ApiQueryOptions = {}) {
  const { status, activeOrganizationId } = useSession();
  const [version, setVersion] = useState(0);

  const ready =
    path !== null &&
    (options.public === true || status === 'authenticated') &&
    (!options.org || Boolean(activeOrganizationId));
  const key = ready
    ? JSON.stringify([path, options.query ?? null, options.org ? activeOrganizationId : null, version])
    : null;

  const [result, setResult] = useState<QueryResult<T>>({ key: null });

  useEffect(() => {
    if (!key) return;
    const [requestPath, query, organizationId] = JSON.parse(key) as [string, Record<string, QueryValue> | null, string | null];
    const controller = new AbortController();
    api<T>(requestPath, { query: query ?? undefined, org: organizationId !== null, signal: controller.signal })
      .then((data) => setResult({ key, data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ key, error: error instanceof ApiError ? error : new ApiError(0, { message: errorMessage(error) }) });
      });
    return () => controller.abort();
  }, [key]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  return {
    data: result.data,
    error: result.key === key ? result.error : undefined,
    loading: key === null ? status === 'loading' : result.key !== key,
    reload,
  };
}
