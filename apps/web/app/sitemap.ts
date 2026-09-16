import { MAX_PAGE_SIZE, type CategoryDto, type Paginated, type ProductDto } from '@topflow/shared';
import type { MetadataRoute } from 'next';
import { connection } from 'next/server';
import { serverApi } from '@/lib/server-api';
import { absoluteUrl } from '@/lib/site';

/** Safety limit on catalogue pages read for the sitemap (MAX_PAGE_SIZE products each). */
const MAX_PRODUCT_PAGES = 50;

/** Every public product, page by page. Stops at the first failure and keeps what it has. */
async function publicProducts(): Promise<ProductDto[]> {
  const products: ProductDto[] = [];
  for (let page = 1; page <= MAX_PRODUCT_PAGES; page += 1) {
    try {
      const result = await serverApi<Paginated<ProductDto>>('/catalog/products', {
        searchParams: new URLSearchParams({ page: String(page), pageSize: String(MAX_PAGE_SIZE), sort: 'name' }),
        revalidate: 3600,
      });
      products.push(...result.items);
      if (page >= result.totalPages) break;
    } catch {
      break;
    }
  }
  return products;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Built per request: the API is not reachable at build time, and its responses are cached anyway.
  await connection();
  const [categories, products] = await Promise.all([
    serverApi<CategoryDto[]>('/catalog/categories', { revalidate: 3600 }).catch((): CategoryDto[] => []),
    publicProducts(),
  ]);

  const pages: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), changeFrequency: 'weekly', priority: 1 },
    { url: absoluteUrl('/products'), changeFrequency: 'daily', priority: 0.9 },
    { url: absoluteUrl('/quote'), changeFrequency: 'monthly', priority: 0.7 },
    { url: absoluteUrl('/contact'), changeFrequency: 'monthly', priority: 0.6 },
  ];

  const categoryPages: MetadataRoute.Sitemap = categories
    .filter((category) => (category.productCount ?? 0) > 0)
    .map((category) => ({
      url: absoluteUrl(`/products?category=${encodeURIComponent(category.slug)}`),
      changeFrequency: 'weekly',
      priority: category.parentId === null ? 0.8 : 0.6,
    }));

  const productPages: MetadataRoute.Sitemap = products.map((product) => ({
    url: absoluteUrl(`/products/${encodeURIComponent(product.slug)}`),
    lastModified: product.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  return [...pages, ...categoryPages, ...productPages];
}
