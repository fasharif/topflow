'use client';

import type { CategoryDto } from '@topflow/shared';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cx } from '../ui';

const SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
];

export function CatalogFilters({ categories, brands }: { categories: CategoryDto[]; brands: Array<{ brand: string; productCount: number }> }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    router.push(`${pathname}?${next.toString()}`);
  };

  const active = (key: string, value: string) => params.get(key) === value;
  const visibleCategories = categories.filter((c) => (c.productCount ?? 0) > 0);

  return (
    <aside className="space-y-6 text-sm">
      <div>
        <label htmlFor="sort" className="mb-1.5 block font-semibold text-ink-900">
          Sort by
        </label>
        <select
          id="sort"
          value={params.get('sort') ?? 'newest'}
          onChange={(event) => update('sort', event.target.value)}
          className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3"
        >
          {SORTS.map((sort) => (
            <option key={sort.value} value={sort.value}>
              {sort.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <p className="mb-2 font-semibold text-ink-900">Category</p>
        <ul className="space-y-1">
          <li>
            <button type="button" onClick={() => update('category', null)} className={cx('w-full rounded-md px-2 py-1.5 text-left hover:bg-slate-100', !params.get('category') && 'bg-brand-50 font-medium text-brand-700')}>
              All categories
            </button>
          </li>
          {visibleCategories.map((category) => (
            <li key={category.id}>
              <button
                type="button"
                onClick={() => update('category', category.slug)}
                className={cx('flex w-full justify-between rounded-md px-2 py-1.5 text-left hover:bg-slate-100', active('category', category.slug) && 'bg-brand-50 font-medium text-brand-700')}
              >
                <span>{category.name}</span>
                <span className="text-slate-400">{category.productCount}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="mb-2 font-semibold text-ink-900">Brand</p>
        <div className="flex flex-wrap gap-2">
          {brands.map(({ brand }) => (
            <button
              key={brand}
              type="button"
              onClick={() => update('brand', active('brand', brand) ? null : brand)}
              className={cx('rounded-full border px-3 py-1 text-xs', active('brand', brand) ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-brand-500')}
            >
              {brand}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 font-semibold text-ink-900">Availability</p>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={active('stockStatus', 'IN_STOCK')} onChange={(event) => update('stockStatus', event.target.checked ? 'IN_STOCK' : null)} className="size-4 accent-brand-600" />
          In stock only
        </label>
      </div>
    </aside>
  );
}
