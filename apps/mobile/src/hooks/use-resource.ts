import { useCallback, useEffect, useRef, useState } from 'react';

import { errorMessage } from '@/lib/http';

type Fetcher<T> = () => Promise<T>;

interface ResourceState<T> {
  source: Fetcher<T>;
  data?: T;
  error: string | null;
}

export interface Resource<T> {
  data: T | undefined;
  /** Latest error for the current fetcher (data from an earlier success is kept). */
  error: string | null;
  /** `true` until the first response for the current fetcher arrives. */
  loading: boolean;
  refreshing: boolean;
  refresh: () => Promise<void>;
  /** Replaces the loaded data, e.g. with the response of a mutation. */
  setData: (data: T) => void;
}

/**
 * Loads data with `fetcher` and reloads whenever its identity changes — wrap it in `useCallback`
 * with the values it depends on. Pass `null` to skip loading. Responses that arrive after a newer
 * load has started are ignored.
 */
export function useResource<T>(fetcher: Fetcher<T> | null): Resource<T> {
  const [state, setState] = useState<ResourceState<T> | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const sequence = useRef(0);

  useEffect(() => {
    if (!fetcher) return;
    const id = ++sequence.current;
    fetcher().then(
      (data) => {
        if (id === sequence.current) setState({ source: fetcher, data, error: null });
      },
      (error: unknown) => {
        if (id === sequence.current) setState({ source: fetcher, error: errorMessage(error) });
      },
    );
  }, [fetcher]);

  const refresh = useCallback(async () => {
    if (!fetcher) return;
    const id = ++sequence.current;
    setRefreshing(true);
    try {
      const data = await fetcher();
      if (id === sequence.current) setState({ source: fetcher, data, error: null });
    } catch (error) {
      if (id === sequence.current) {
        const message = errorMessage(error);
        setState((previous) =>
          previous?.source === fetcher ? { ...previous, error: message } : { source: fetcher, error: message },
        );
      }
    } finally {
      setRefreshing(false);
    }
  }, [fetcher]);

  const setData = useCallback(
    (data: T) => {
      if (!fetcher) return;
      sequence.current += 1; // Supersede in-flight loads so they cannot overwrite this value.
      setState({ source: fetcher, data, error: null });
    },
    [fetcher],
  );

  const current = state?.source === fetcher ? state : null;
  return {
    data: current?.data,
    error: current?.error ?? null,
    loading: fetcher !== null && current === null,
    refreshing,
    refresh,
    setData,
  };
}
