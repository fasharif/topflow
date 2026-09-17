import type { Paginated, ProductDto } from '@topflow/shared';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { ProductDetail } from '@/components/catalog/product-detail';
import { Container } from '@/components/ui';
import { ServerApiError, serverApi } from '@/lib/server-api';

async function loadProduct(slug: string): Promise<ProductDto | null> {
  try {
    return await serverApi<ProductDto>(`/catalog/products/${encodeURIComponent(slug)}`, { revalidate: 0 });
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
    revalidate: 0,
  }).catch(() => null);
  return (page?.items ?? []).filter((item) => item.id !== product.id).slice(0, 4);
}

export async function generateMetadata({ params }: PageProps<'/products/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const product = await loadProduct(slug).catch(() => null);
  if (!product) return { title: 'Product' };
  const description = product.description ?? `${product.name} — ${product.sku}`;
  // Link previews (WhatsApp, email, social) show the product rather than the site-wide defaults.
  const images = product.imageUrl ? [{ url: product.imageUrl, alt: product.name }] : undefined;
  return {
    title: product.name,
    description,
    openGraph: { type: 'website', siteName: 'Top Flow Hub', locale: 'en_AE', title: product.name, description, images },
    twitter: { card: 'summary', title: product.name, description, images },
  };
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
    <Container className="py-8 sm:py-10">
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />}
      <ProductDetail product={product} slug={slug} related={related} />
    </Container>
  );
}
