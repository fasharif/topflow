'use client';

import type { CategoryDto } from '@topflow/shared';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { cx } from '../ui';

const SORTS = [
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'newest', label: 'Newest' },
];

const AVAILABILITY = [
  { value: '', label: 'All' },
  { value: 'IN_STOCK', label: 'In stock' },
  { value: 'ON_ORDER', label: 'On order' },
];

/** Builds catalogue URLs that keep the other filters and reset pagination. */
function useCatalogLinks() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const hrefWith = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete('page');
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  };
  return { params, hrefWith, go: (changes: Record<string, string | null>) => router.push(hrefWith(changes), { scroll: false }) };
}

const visible = (category: CategoryDto) => (category.productCount ?? 0) > 0;

/** Category tree and brands, shown beside the product grid on large screens. */
export function CatalogFilters({ categories, brands }: { categories: CategoryDto[]; brands: Array<{ brand: string; productCount: number }> }) {
  const { params, hrefWith } = useCatalogLinks();
  const current = params.get('category');
  const activeCategory = categories.find((category) => category.slug === current);
  const openParentId = activeCategory ? (activeCategory.parentId ?? activeCategory.id) : null;
  const parents = categories.filter((category) => category.parentId === null && visible(category));
  const row = (active: boolean, nested = false) =>
    cx(
      'flex w-full items-baseline justify-between gap-3 rounded-lg px-2.5 py-1.5 transition-colors',
      nested ? 'text-[13px]' : 'text-sm',
      active ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-700 hover:bg-slate-100 hover:text-ink-900',
    );

  return (
    <aside className="hidden space-y-8 lg:block">
      <nav aria-label="Categories">
        <p className="eyebrow mb-3 px-2.5 text-slate-500">Categories</p>
        <ul className="space-y-0.5">
          <li>
            <Link href={hrefWith({ category: null })} className={row(!current)} aria-current={!current ? 'page' : undefined}>
              All products
            </Link>
          </li>
          {parents.map((parent) => (
            <li key={parent.id}>
              <Link href={hrefWith({ category: parent.slug })} className={row(current === parent.slug)} aria-current={current === parent.slug ? 'page' : undefined}>
                <span>{parent.name}</span>
                <span className="font-mono text-[11px] tabular-nums text-slate-500">{parent.productCount}</span>
              </Link>
              {openParentId === parent.id && (
                <ul className="mb-2 ml-3 mt-1 space-y-0.5 border-l border-slate-200 pl-2">
                  {categories
                    .filter((line) => line.parentId === parent.id && visible(line))
                    .map((line) => (
                      <li key={line.id}>
                        <Link href={hrefWith({ category: line.slug })} className={row(current === line.slug, true)} aria-current={current === line.slug ? 'page' : undefined}>
                          <span>{line.name}</span>
                          <span className="font-mono text-[11px] tabular-nums text-slate-500">{line.productCount}</span>
                        </Link>
                      </li>
                    ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </nav>

      {brands.length > 1 && (
        <div>
          <p className="eyebrow mb-3 px-2.5 text-slate-500">Brand</p>
          <div className="flex flex-wrap gap-2 px-2.5">
            {brands.map(({ brand, productCount }) => {
              const active = params.get('brand') === brand;
              return (
                <Link
                  key={brand}
                  href={hrefWith({ brand: active ? null : brand })}
                  aria-pressed={active}
                  className={cx(
                    'rounded-full border px-3 py-1 text-xs transition-colors',
                    active ? 'border-ink-900 bg-ink-900 text-canvas' : 'border-slate-300 bg-white text-slate-700 hover:border-ink-900/40',
                  )}
                >
                  {brand} <span className="text-[10px] opacity-70">{productCount}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );
}

/** Search, availability, sort, mobile category chips and the active-filter summary above the grid. */
export function CatalogToolbar({ categories, total }: { categories: CategoryDto[]; total: number }) {
  const { params, hrefWith, go } = useCatalogLinks();
  const [search, setSearch] = useState(params.get('search') ?? '');
  const current = params.get('category');
  const activeCategory = categories.find((category) => category.slug === current);
  const stockStatus = params.get('stockStatus') ?? '';
  const brand = params.get('brand');
  const parentId = activeCategory ? (activeCategory.parentId ?? activeCategory.id) : null;
  const chips = parentId
    ? categories.filter((category) => category.parentId === parentId && visible(category))
    : categories.filter((category) => category.parentId === null && visible(category));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    go({ search: search.trim() || null });
  };

  const activeFilters = [
    params.get('search') && { label: `“${params.get('search')}”`, href: hrefWith({ search: null }) },
    activeCategory && { label: activeCategory.name, href: hrefWith({ category: null }) },
    brand && { label: brand, href: hrefWith({ brand: null }) },
    stockStatus && { label: stockStatus === 'IN_STOCK' ? 'In stock' : 'On order', href: hrefWith({ stockStatus: null }) },
  ].filter((filter): filter is { label: string; href: string } => Boolean(filter));

  return (
    <div className="mb-8 space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <form role="search" onSubmit={submit} className="relative flex-1">
          <label htmlFor="catalog-search" className="sr-only">
            Search the catalogue
          </label>
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4 4" strokeLinecap="round" />
          </svg>
          <input
            id="catalog-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, code, size…"
            className="h-11 w-full rounded-full border border-slate-300 bg-white pl-11 pr-4 text-sm text-ink-900 placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Availability" className="flex rounded-full border border-slate-300 bg-white p-1">
            {AVAILABILITY.map((option) => (
              <Link
                key={option.label}
                href={hrefWith({ stockStatus: option.value || null })}
                scroll={false}
                aria-current={stockStatus === option.value ? 'true' : undefined}
                className={cx(
                  'rounded-full px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors',
                  stockStatus === option.value ? 'bg-brand-600 text-white' : 'text-slate-600 hover:text-ink-900',
                )}
              >
                {option.label}
              </Link>
            ))}
          </nav>
          <label htmlFor="catalog-sort" className="sr-only">
            Sort by
          </label>
          <select
            id="catalog-sort"
            value={params.get('sort') ?? 'name'}
            onChange={(event) => go({ sort: event.target.value === 'name' ? null : event.target.value })}
            className="h-11 rounded-full border border-slate-300 bg-white px-4 text-sm text-ink-900 focus:border-brand-500 focus:outline-none"
          >
            {SORTS.map((sort) => (
              <option key={sort.value} value={sort.value}>
                {sort.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
          {parentId && (
            <Link href={hrefWith({ category: null })} className="shrink-0 rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-xs text-slate-700">
              ← All categories
            </Link>
          )}
          {chips.map((category) => (
            <Link
              key={category.id}
              href={hrefWith({ category: category.slug })}
              className={cx(
                'shrink-0 rounded-full border px-3.5 py-1.5 text-xs',
                current === category.slug ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-slate-700',
              )}
            >
              {category.name} <span className="opacity-70">{category.productCount}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-2 font-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">
          Showing {total} {total === 1 ? 'item' : 'items'}
        </p>
        {activeFilters.map((filter) => (
          <Link key={filter.label} href={filter.href} className="inline-flex items-center gap-1.5 rounded-full bg-ink-900/5 px-3 py-1 text-xs text-ink-900 hover:bg-ink-900/10">
            {filter.label}
            <span aria-hidden="true">×</span>
            <span className="sr-only">Remove filter</span>
          </Link>
        ))}
        {activeFilters.length > 1 && (
          <Link href="/products" className="text-xs font-medium text-brand-600 hover:underline">
            Clear all
          </Link>
        )}
      </div>
    </div>
  );
}
