import type { Paginated, ProductDto } from '@topflow/shared';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { ProductDetail } from '@/components/catalog/product-detail';
import { ServerApiError, serverApi } from '@/lib/server-api';

async function loadProduct(slug: string): Promise<ProductDto | null> {
  try {
    return await serverApi<ProductDto>(`/catalog/products/${encodeURIComponent(slug)}`, { revalidate: 60 });
  } catch (error) {
    if (error instanceof ServerApiError && error.status === 404) return null;
    throw error;
  }
}

/** Other items from the same product line, for the "More from" section. */
async function loadRelated(product: ProductDto | null): Promise<ProductDto[]> {
  if (!product?.category) return [];
  const page = await serverApi<Paginated<ProductDto>>('/catalog/products', {
    searchParams: new URLSearchParams({ category: product.category.slug, pageSize: '5', sort: 'name' }),
    revalidate: 120,
  }).catch(() => null);
  return (page?.items ?? []).filter((item) => item.id !== product.id).slice(0, 4);
}

export async function generateMetadata({ params }: PageProps<'/products/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const product = await loadProduct(slug).catch(() => null);
  return product
    ? { title: product.name, description: product.description ?? `${product.name} — ${product.sku}` }
    : { title: 'Product' };
}

export default async function ProductPage({ params }: PageProps<'/products/[slug]'>) {
  await connection();
  const { slug } = await params;
  const product = await loadProduct(slug);
  const related = await loadRelated(product);

  // Structured data so search engines can show the price range and availability.
  const availability = product?.stockStatus === 'IN_STOCK' ? 'https://schema.org/InStock' : 'https://schema.org/BackOrder';
  const jsonLd = product && {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    sku: product.sku,
    brand: product.brand ? { '@type': 'Brand', name: product.brand } : undefined,
    description: product.description ?? undefined,
    offers: product.priceRange
      ? { '@type': 'AggregateOffer', priceCurrency: 'AED', lowPrice: product.priceRange.retailMin, highPrice: product.priceRange.retailMax, availability }
      : { '@type': 'Offer', priceCurrency: 'AED', price: product.retailPrice, availability },
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />}
      <ProductDetail product={product} slug={slug} related={related} />
    </div>
  );
}
