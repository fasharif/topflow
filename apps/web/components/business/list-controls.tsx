'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Input, Select } from '@/components/ui';

interface ListPatch<S extends string> {
  status?: S | null;
  search?: string;
  page?: number;
}

/**
 * URL-backed list state (`?page`, `?status`, `?search`) so filters survive reloads, links and the
 * back button. Uses `useSearchParams`, so the calling component must render inside `<Suspense>`.
 */
export function useListParams<S extends string>(statuses: readonly S[]) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const status = statuses.find((value) => value === params.get('status')) ?? null;
  const search = params.get('search')?.trim() ?? '';
  const requestedPage = Number(params.get('page'));
  const page = Number.isInteger(requestedPage) && requestedPage > 1 ? requestedPage : 1;

  const update = (patch: ListPatch<S>) => {
    const next = new URLSearchParams(params.toString());
    const assign = (key: string, value: string | null | undefined) => {
      if (value) next.set(key, value);
      else next.delete(key);
    };
    if ('status' in patch) assign('status', patch.status);
    if ('search' in patch) assign('search', patch.search?.trim());
    // Changing a filter always returns to the first page.
    assign('page', patch.page !== undefined && patch.page > 1 ? String(patch.page) : null);
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: patch.page !== undefined });
  };

  return {
    status,
    search,
    page,
    filtered: status !== null || search !== '',
    update,
    /** Ready to pass to `useApiQuery` (empty values are dropped by the API client). */
    query: { page, status: status ?? undefined, search: search || undefined },
  };
}

function SearchForm({ initial, placeholder, onSearch }: { initial: string; placeholder: string; onSearch: (value: string) => void }) {
  const [value, setValue] = useState(initial);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSearch(value);
  };
  return (
    <form role="search" onSubmit={submit} className="flex flex-1 gap-2">
      <label htmlFor="list-search" className="sr-only">
        Search
      </label>
      <Input id="list-search" type="search" value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} />
      <Button type="submit" variant="secondary">
        Search
      </Button>
    </form>
  );
}

export function ListToolbar<S extends string>({
  statuses,
  labels,
  status,
  search,
  searchPlaceholder,
  onChange,
}: {
  statuses: readonly S[];
  labels: Record<S, string>;
  status: S | null;
  search: string;
  searchPlaceholder: string;
  onChange: (patch: ListPatch<S>) => void;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
      {/* Keyed by the URL value so the input resets when the search is cleared elsewhere. */}
      <SearchForm key={search} initial={search} placeholder={searchPlaceholder} onSearch={(value) => onChange({ search: value })} />
      <div className="sm:w-56">
        <label htmlFor="list-status" className="sr-only">
          Filter by status
        </label>
        <Select
          id="list-status"
          value={status ?? ''}
          onChange={(event) => onChange({ status: statuses.find((value) => value === event.target.value) ?? null })}
        >
          <option value="">All statuses</option>
          {statuses.map((value) => (
            <option key={value} value={value}>
              {labels[value]}
            </option>
          ))}
        </Select>
      </div>
      {(status !== null || search !== '') && (
        <Button variant="ghost" onClick={() => onChange({ status: null, search: '' })}>
          Clear filters
        </Button>
      )}
    </div>
  );
}
