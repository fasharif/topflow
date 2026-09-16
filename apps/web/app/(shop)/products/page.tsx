import type { CategoryDto, Paginated, ProductDto } from '@topflow/shared';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { CatalogFilters, CatalogToolbar } from '@/components/catalog/catalog-filters';
import { CatalogGrid } from '@/components/catalog/catalog-grid';
import { ContactOptions } from '@/components/contact-options';
import { Alert, Container, PageHeader, PaginationLinks, type BreadcrumbItem } from '@/components/ui';
import { serverApi } from '@/lib/server-api';

export const metadata: Metadata = {
  title: 'Catalogue',
  description:
    'Browse Top Flow’s catalogue of electrofusion fittings, sprinklers and rotors, drip irrigation, pipes and fittings, valves, filtration and landscaping products, with approximate prices including VAT.',
};

const FORWARDED = ['search', 'category', 'brand', 'stockStatus', 'sort', 'page'] as const;

const DEFAULT_DESCRIPTION =
  'Every item shows an approximate price range including VAT. Buy online at listed prices, or request a quote for project quantities and your best price.';

type CatalogData = [Paginated<ProductDto> | null, CategoryDto[], Array<{ brand: string; productCount: number }>];

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

  const breadcrumbs: BreadcrumbItem[] | undefined = category
    ? [{ label: 'Catalogue', href: '/products' }, ...(parent ? [{ label: parent.name, href: `/products?category=${parent.slug}` }] : []), { label: category.name }]
    : query.search
      ? [{ label: 'Catalogue', href: '/products' }, { label: 'Search results' }]
      : undefined;

  return (
    <Container className="py-8 sm:py-10">
      <PageHeader
        breadcrumbs={breadcrumbs}
        title={query.search ? `Results for “${query.search}”` : (category?.name ?? 'Catalogue')}
        description={<p className="max-w-2xl">{category?.description ?? DEFAULT_DESCRIPTION}</p>}
      />

      <div className="grid gap-10 lg:grid-cols-[240px_minmax(0,1fr)]">
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
              <PaginationLinks className="mt-12" page={products.page} totalPages={products.totalPages} hrefFor={pageLink} />
            </>
          ) : (
            <Alert tone="danger" title="The catalogue is temporarily unavailable">
              <p>Please try again in a moment, or contact our sales team.</p>
              <ContactOptions className="mt-2" />
            </Alert>
          )}
        </div>
      </div>
    </Container>
  );
}
