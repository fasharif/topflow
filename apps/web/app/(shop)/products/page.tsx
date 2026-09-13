import type { CategoryDto, Paginated, ProductDto } from '@topflow/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { CatalogFilters } from '@/components/catalog/catalog-filters';
import { CatalogGrid } from '@/components/catalog/catalog-grid';
import { Alert, PageHeader, buttonClass } from '@/components/ui';
import { serverApi } from '@/lib/server-api';

export const metadata: Metadata = {
  title: 'Products',
  description: 'Browse sprinklers, rotors, drip irrigation, valves, controllers, pipes, filters and pumps.',
};

const FORWARDED = ['search', 'category', 'brand', 'stockStatus', 'sort', 'page'] as const;

type CatalogData = [Paginated<ProductDto> | null, CategoryDto[], Array<{ brand: string; productCount: number }>];

export default async function ProductsPage({ searchParams }: PageProps<'/products'>) {
  // Render per request (the API is not reachable at build time); fetches are still cached.
  await connection();
  const params = await searchParams;
  const query: Record<string, string> = { pageSize: '24' };
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
  const pageLink = (page: number) => `/products?${new URLSearchParams({ ...query, page: String(page) }).toString()}`;

  return (
    <div>
      <PageHeader
        eyebrow="Catalog"
        title={query.search ? `Results for “${query.search}”` : (category?.name ?? 'All products')}
        description={products ? `${products.total} products` : undefined}
      />
      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <Suspense fallback={null}>
          <CatalogFilters categories={categories} brands={brands} />
        </Suspense>
        <div>
          {products ? (
            <>
              <CatalogGrid initial={products} query={query} />
              {products.totalPages > 1 && (
                <nav className="mt-8 flex items-center justify-between text-sm" aria-label="Pagination">
                  <span className="text-slate-500">
                    Page {products.page} of {products.totalPages}
                  </span>
                  <div className="flex gap-2">
                    {products.page > 1 && (
                      <Link className={buttonClass('secondary', 'sm')} href={pageLink(products.page - 1)}>
                        Previous
                      </Link>
                    )}
                    {products.page < products.totalPages && (
                      <Link className={buttonClass('secondary', 'sm')} href={pageLink(products.page + 1)}>
                        Next
                      </Link>
                    )}
                  </div>
                </nav>
              )}
            </>
          ) : (
            <Alert tone="danger" title="The catalog is temporarily unavailable">
              Please try again in a moment.
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}
