import type { CategoryDto, Paginated, ProductDto } from '@topflow/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { CatalogFilters, CatalogToolbar } from '@/components/catalog/catalog-filters';
import { CatalogGrid } from '@/components/catalog/catalog-grid';
import { Alert, PageHeader, cx } from '@/components/ui';
import { serverApi } from '@/lib/server-api';

export const metadata: Metadata = {
  title: 'Catalogue',
  description:
    'Browse Top Flow’s catalogue of electrofusion fittings, sprinklers and rotors, drip irrigation, pipes and fittings, valves, filtration and landscaping products.',
};

const FORWARDED = ['search', 'category', 'brand', 'stockStatus', 'sort', 'page'] as const;

type CatalogData = [Paginated<ProductDto> | null, CategoryDto[], Array<{ brand: string; productCount: number }>];

/** Page numbers around the current page, with gaps marked as null. */
function pageWindow(page: number, totalPages: number): Array<number | null> {
  const pages = new Set([1, totalPages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= totalPages));
  const sorted = [...pages].sort((a, b) => a - b);
  return sorted.flatMap((p, i) => (i > 0 && p - sorted[i - 1] > 1 ? [null, p] : [p]));
}

export default async function ProductsPage({ searchParams }: PageProps<'/products'>) {
  // Render per request (the API is not reachable at build time); fetches are still cached.
  await connection();
  const params = await searchParams;
  const query: Record<string, string> = { pageSize: '24', sort: 'name' };
  for (const key of FORWARDED) {
    const value = params[key];
    if (typeof value === 'string' && value) query[key] = value;
  }

  const [products, categories, brands]: CatalogData = await Promise.all([
    serverApi<Paginated<ProductDto>>('/catalog/products', { searchParams: new URLSearchParams(query), revalidate: 30 }),
    serverApi<CategoryDto[]>('/catalog/categories', { revalidate: 300 }),
    serverApi<Array<{ brand: string; productCount: number }>>('/catalog/brands', { revalidate: 300 }),
  ]).catch((): CatalogData => [null, [], []]);

  const category = categories.find((c) => c.slug === query.category);
  const parent = category?.parentId ? categories.find((c) => c.id === category.parentId) : undefined;
  const pageLink = (page: number) => `/products?${new URLSearchParams({ ...query, page: String(page) }).toString()}`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      {parent && (
        <nav aria-label="Breadcrumb" className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">
          <Link href="/products" className="hover:text-brand-600">
            Catalogue
          </Link>
          {' / '}
          <Link href={`/products?category=${parent.slug}`} className="hover:text-brand-600">
            {parent.name}
          </Link>
        </nav>
      )}
      <PageHeader
        eyebrow={parent ? undefined : query.search ? 'Search' : 'Catalogue'}
        title={query.search ? `Results for “${query.search}”` : (category?.name ?? 'Our items')}
        description={
          <span className="block max-w-2xl">
            {category?.description ??
              'Every item shows an indicative price range, including VAT. Buy online, or request a quotation for project quantities and your best price.'}
          </span>
        }
      />

      <div className="mt-8 grid gap-10 lg:grid-cols-[250px_1fr]">
        <Suspense fallback={null}>
          <CatalogFilters categories={categories} brands={brands} />
        </Suspense>
        {/* min-w-0: grid items default to their content width, which would let the chip row widen the page. */}
        <div className="min-w-0">
          <Suspense fallback={null}>
            <CatalogToolbar key={query.search ?? ''} categories={categories} total={products?.total ?? 0} />
          </Suspense>
          {products ? (
            <>
              <CatalogGrid initial={products} query={query} />
              {products.totalPages > 1 && (
                <nav className="mt-12 flex flex-wrap items-center justify-center gap-2" aria-label="Pagination">
                  {products.page > 1 && (
                    <Link href={pageLink(products.page - 1)} className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm hover:border-ink-900/40">
                      ← Previous
                    </Link>
                  )}
                  {pageWindow(products.page, products.totalPages).map((page, index) =>
                    page === null ? (
                      <span key={`gap-${index}`} className="px-1 text-slate-500">
                        …
                      </span>
                    ) : (
                      <Link
                        key={page}
                        href={pageLink(page)}
                        aria-current={page === products.page ? 'page' : undefined}
                        className={cx(
                          'grid size-10 place-items-center rounded-full text-sm tabular-nums',
                          page === products.page ? 'bg-ink-900 text-canvas' : 'border border-slate-300 bg-white hover:border-ink-900/40',
                        )}
                      >
                        {page}
                      </Link>
                    ),
                  )}
                  {products.page < products.totalPages && (
                    <Link href={pageLink(products.page + 1)} className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm hover:border-ink-900/40">
                      Next →
                    </Link>
                  )}
                </nav>
              )}
            </>
          ) : (
            <Alert tone="danger" title="The catalogue is temporarily unavailable">
              Please try again in a moment.
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}
