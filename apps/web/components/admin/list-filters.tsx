'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Button, Input } from '@/components/ui';

/** `value` when it is one of `allowed`, otherwise '' — hand-edited query strings never reach the API. */
export function pickEnum<T extends string>(value: string | null, allowed: readonly T[]): T | '' {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : '';
}

/**
 * List filters kept in the query string, so filtered views can be bookmarked and linked to
 * (e.g. from the dashboard). Components using it must render inside <Suspense>.
 */
export function useUrlFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const get = (key: string): string => params.get(key) ?? '';
  const page = Math.max(1, Math.floor(Number(params.get('page'))) || 1);

  /** Applies the patch (null/'' removes a key). Changing any filter resets to page 1. */
  const update = (patch: Record<string, string | number | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, String(value));
    }
    if (!('page' in patch) || next.get('page') === '1') next.delete('page');
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: 'page' in patch });
  };

  return { get, page, update };
}

/** Uncontrolled search field; key it by the current search term so it resets when the URL changes. */
export function SearchBox({
  initial,
  placeholder,
  label,
  onSearch,
}: {
  initial: string;
  placeholder: string;
  label: string;
  onSearch: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSearch(value.trim());
  };
  return (
    <form role="search" onSubmit={submit} className="flex min-w-0 flex-1 gap-2">
      <Input type="search" value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} aria-label={label} className="min-w-0" />
      <Button type="submit" variant="secondary">
        Search
      </Button>
    </form>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-xs md:flex-row md:items-center">{children}</div>;
}
