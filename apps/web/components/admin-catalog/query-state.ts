'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type ParamValue = string | number | boolean | null | undefined;

/**
 * List filters and pagination kept in the URL, so back-office views are shareable, survive a
 * reload and work with the back button. Must be rendered inside <Suspense> (useSearchParams).
 *
 * `transient` keys (one-off notices such as `?created=SKU`) are dropped on the next update.
 */
export function useQueryState(transient: readonly string[] = []) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const get = (key: string): string => params.get(key) ?? '';
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);

  const update = (patch: Record<string, ParamValue>) => {
    const next = new URLSearchParams(params.toString());
    for (const key of transient) next.delete(key);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === undefined || value === '' || value === false || (key === 'page' && Number(value) <= 1)) {
        next.delete(key);
      } else {
        next.set(key, String(value));
      }
    }
    // Changing a filter starts again from the first page.
    if (!('page' in patch)) next.delete('page');
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  return { get, page, update };
}
