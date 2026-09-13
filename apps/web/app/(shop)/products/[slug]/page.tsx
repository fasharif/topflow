import type { ProductDto } from '@topflow/shared';
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

  // Structured data so search engines can show price and availability.
  const jsonLd = product && {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    sku: product.sku,
    brand: product.brand ? { '@type': 'Brand', name: product.brand } : undefined,
    description: product.description ?? undefined,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'AED',
      price: product.retailPrice,
      availability: product.stockStatus === 'IN_STOCK' ? 'https://schema.org/InStock' : 'https://schema.org/BackOrder',
    },
  };

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        />
      )}
      <ProductDetail product={product} slug={slug} />
    </>
  );
}
