import type { Paginated } from '@topflow/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { errorMessage } from '@/lib/http';

export type PageFetcher<T> = (page: number) => Promise<Paginated<T>>;

interface ListState<T> {
  source: PageFetcher<T>;
  items: T[];
  page: number;
  totalPages: number;
  total: number;
  /** `true` once the first page has loaded successfully. */
  loaded: boolean;
  error: string | null;
}

export interface PaginatedList<T> {
  items: T[];
  total: number;
  loaded: boolean;
  /** `true` until the first response for the current fetcher arrives. */
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  /** Reloads the first page. `silent` skips the pull-to-refresh spinner (e.g. refresh on focus). */
  refresh: (options?: { silent?: boolean }) => Promise<void>;
  loadMore: () => void;
}

function firstPage<T>(source: PageFetcher<T>, result: Paginated<T>): ListState<T> {
  return {
    source,
    items: result.items,
    page: result.page,
    totalPages: result.totalPages,
    total: result.total,
    loaded: true,
    error: null,
  };
}

function failed<T>(source: PageFetcher<T>, error: string): ListState<T> {
  return { source, items: [], page: 0, totalPages: 0, total: 0, loaded: false, error };
}

/**
 * Infinite list over a paginated endpoint. The first page reloads whenever `fetchPage` changes
 * identity (wrap it in `useCallback`); pass `null` to skip loading. `keyOf` must be stable and is
 * used to drop duplicates when pages shift between requests.
 */
export function usePaginatedList<T>(fetchPage: PageFetcher<T> | null, keyOf: (item: T) => string): PaginatedList<T> {
  const [list, setList] = useState<ListState<T> | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  /** Incremented for every first-page load; later pages check it to discard stale results. */
  const sequence = useRef(0);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    if (!fetchPage) return;
    const id = ++sequence.current;
    fetchPage(1).then(
      (result) => {
        if (id === sequence.current) setList(firstPage(fetchPage, result));
      },
      (error: unknown) => {
        if (id === sequence.current) setList(failed(fetchPage, errorMessage(error)));
      },
    );
  }, [fetchPage]);

  const refresh = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!fetchPage) return;
      const id = ++sequence.current;
      const showSpinner = !options?.silent;
      if (showSpinner) setRefreshing(true);
      try {
        const result = await fetchPage(1);
        if (id === sequence.current) setList(firstPage(fetchPage, result));
      } catch (error) {
        if (id === sequence.current) {
          const message = errorMessage(error);
          setList((previous) =>
            previous?.source === fetchPage ? { ...previous, error: message } : failed(fetchPage, message),
          );
        }
      } finally {
        if (showSpinner) setRefreshing(false);
      }
    },
    [fetchPage],
  );

  const loadMore = useCallback(() => {
    if (!fetchPage || !list || list.source !== fetchPage || !list.loaded) return;
    if (list.page >= list.totalPages || loadingMoreRef.current) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);
    const startedWith = sequence.current;
    const nextPage = list.page + 1;

    fetchPage(nextPage)
      .then(
        (result) => {
          if (startedWith !== sequence.current) return;
          setList((previous) => {
            if (!previous || previous.source !== fetchPage || previous.page !== nextPage - 1) return previous;
            const seen = new Set(previous.items.map(keyOf));
            const fresh = result.items.filter((item) => !seen.has(keyOf(item)));
            return {
              ...previous,
              items: [...previous.items, ...fresh],
              page: result.page,
              totalPages: result.totalPages,
              total: result.total,
              error: null,
            };
          });
        },
        (error: unknown) => {
          if (startedWith !== sequence.current) return;
          const message = errorMessage(error);
          setList((previous) => (previous?.source === fetchPage ? { ...previous, error: message } : previous));
        },
      )
      .finally(() => {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
  }, [fetchPage, keyOf, list]);

  const current = list?.source === fetchPage ? list : null;
  return {
    items: current?.items ?? [],
    total: current?.total ?? 0,
    loaded: current?.loaded ?? false,
    loading: fetchPage !== null && current === null,
    error: current?.error ?? null,
    refreshing,
    loadingMore,
    hasMore: current !== null && current.loaded && current.page < current.totalPages,
    refresh,
    loadMore,
  };
}
