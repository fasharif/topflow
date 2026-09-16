'use client';

import type { CategoryDto } from '@topflow/shared';
import { ChevronLeft, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, SearchInput, Select, cx } from '../ui';

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
      'flex w-full items-baseline justify-between gap-3 rounded-lg px-3 text-sm transition-colors',
      nested ? 'py-1.5' : 'py-2',
      active ? 'bg-brand-50 font-medium text-brand-800' : 'text-slate-700 hover:bg-white hover:text-ink-900',
    );
  const count = 'font-mono text-xs tabular-nums text-slate-500';

  return (
    <aside className="hidden lg:block" aria-label="Catalogue filters">
      <nav aria-labelledby="category-filter-heading">
        <h2 id="category-filter-heading" className="eyebrow mb-3 px-3 text-slate-600">
          Categories
        </h2>
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
                <span className={count}>{parent.productCount}</span>
              </Link>
              {openParentId === parent.id && (
                <ul className="mt-1 mb-2 ml-3 space-y-0.5 border-l border-slate-200 pl-2">
                  {categories
                    .filter((line) => line.parentId === parent.id && visible(line))
                    .map((line) => (
                      <li key={line.id}>
                        <Link
                          href={hrefWith({ category: line.slug })}
                          className={row(current === line.slug, true)}
                          aria-current={current === line.slug ? 'page' : undefined}
                        >
                          <span>{line.name}</span>
                          <span className={count}>{line.productCount}</span>
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
        <div className="mt-8">
          <h2 className="eyebrow mb-3 px-3 text-slate-600">Brand</h2>
          <ul className="flex flex-wrap gap-2 px-3">
            {brands.map(({ brand, productCount }) => {
              const active = params.get('brand') === brand;
              return (
                <li key={brand}>
                  <Link
                    href={hrefWith({ brand: active ? null : brand })}
                    aria-current={active ? 'true' : undefined}
                    className={cx(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors',
                      active ? 'border-ink-900 bg-ink-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400',
                    )}
                  >
                    {brand}
                    <span className="text-xs tabular-nums opacity-80">{productCount}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
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
    <div className="mb-6 space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <form role="search" onSubmit={submit} className="flex min-w-0 flex-1 gap-2">
          <label htmlFor="catalog-search" className="sr-only">
            Search the catalogue
          </label>
          <SearchInput
            id="catalog-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, SKU or size…"
            enterKeyHint="search"
            className="flex-1"
          />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Availability" className="flex rounded-full border border-slate-300 bg-white p-1 shadow-xs">
            {AVAILABILITY.map((option) => (
              <Link
                key={option.label}
                href={hrefWith({ stockStatus: option.value || null })}
                scroll={false}
                aria-current={stockStatus === option.value ? 'true' : undefined}
                className={cx(
                  'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                  stockStatus === option.value ? 'bg-brand-600 text-white' : 'text-slate-700 hover:text-ink-900',
                )}
              >
                {option.label}
              </Link>
            ))}
          </nav>
          <label htmlFor="catalog-sort" className="sr-only">
            Sort by
          </label>
          <div className="w-48">
            <Select id="catalog-sort" value={params.get('sort') ?? 'name'} onChange={(event) => go({ sort: event.target.value === 'name' ? null : event.target.value })}>
              {SORTS.map((sort) => (
                <option key={sort.value} value={sort.value}>
                  {sort.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:hidden">
          {parentId && (
            <Link
              href={hrefWith({ category: null })}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-300 bg-white py-1.5 pr-3.5 pl-2.5 text-sm text-slate-700"
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
              All categories
            </Link>
          )}
          {chips.map((category) => (
            <Link
              key={category.id}
              href={hrefWith({ category: category.slug })}
              aria-current={current === category.slug ? 'page' : undefined}
              className={cx(
                'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm',
                current === category.slug ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-slate-700',
              )}
            >
              {category.name}
              <span className="text-xs tabular-nums opacity-80">{category.productCount}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-2 text-sm text-slate-600">
          Showing <span className="font-medium text-ink-900">{total.toLocaleString('en-AE')}</span> {total === 1 ? 'product' : 'products'}
        </p>
        {activeFilters.map((filter) => (
          <Link
            key={filter.label}
            href={filter.href}
            className="inline-flex items-center gap-1.5 rounded-full bg-slate-200/70 py-1 pr-2.5 pl-3 text-sm text-ink-900 transition-colors hover:bg-slate-200"
          >
            <span className="sr-only">Remove filter:</span>
            {filter.label}
            <X aria-hidden="true" className="size-3.5" />
          </Link>
        ))}
        {activeFilters.length > 1 && (
          <Link href="/products" className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline">
            Clear all
          </Link>
        )}
      </div>
    </div>
  );
}
