'use client';

import { useState } from 'react';

/**
 * Shows the entity returned by a mutation straight away, until the list refetch lands.
 * Overrides are tied to the exact list they were made against, so as soon as fresh data
 * arrives from the API it wins.
 */
export function usePatchedItems<T extends { id: string }>(items: T[] | undefined) {
  const [patched, setPatched] = useState<{ base: T[] | undefined; byId: Record<string, T> }>({ base: undefined, byId: {} });

  const overrides = patched.base === items ? patched.byId : {};
  const current = (items ?? []).map((item) => overrides[item.id] ?? item);

  const patch = (item: T) => {
    setPatched((state) => ({
      base: items,
      byId: { ...(state.base === items ? state.byId : {}), [item.id]: item },
    }));
  };

  return [current, patch] as const;
}
