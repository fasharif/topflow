'use client';

import { Permission, type ProductDto } from '@topflow/shared';
import { ArrowUpRight, PackageSearch } from 'lucide-react';
import { useParams } from 'next/navigation';
import { RequirePermission } from '@/components/admin-catalog/access';
import { LoadError } from '@/components/admin-catalog/list-controls';
import { ProductForm } from '@/components/admin-catalog/product-form';
import { BackLink, Badge, EmptyState, LinkButton, LoadingBlock, PageHeader } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api';

function EditProduct({ id }: { id: string }) {
  // The catalog endpoint accepts an id as well as a slug; staff also see archived and trade-only products.
  const { data: product, error, reload } = useApiQuery<ProductDto>(`/catalog/products/${encodeURIComponent(id)}`);

  if (!product) {
    if (error?.status === 404) {
      return (
        <EmptyState
          icon={<PackageSearch aria-hidden="true" />}
          title="Product not found"
          description="It may have been removed, or the link is incorrect."
          action={<LinkButton href="/admin/products">Back to products</LinkButton>}
        />
      );
    }
    if (error) return <LoadError title="We couldn't load this product" error={error} onRetry={reload} />;
    return <LoadingBlock label="Loading product…" />;
  }

  return (
    <>
      <BackLink href="/admin/products">Products</BackLink>
      <PageHeader
        title={product.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-slate-600">{product.sku}</span>
            {!product.isActive && <Badge>Archived</Badge>}
            {product.isTradeOnly && <Badge tone="brand">Trade only</Badge>}
            <span>· Last updated {formatDateTime(product.updatedAt)}</span>
          </span>
        }
        actions={
          product.isActive && !product.isTradeOnly ? (
            <LinkButton href={`/products/${product.slug}`} variant="secondary" target="_blank" rel="noopener noreferrer">
              View in storefront
              <ArrowUpRight aria-hidden="true" />
              <span className="sr-only"> (opens in a new tab)</span>
            </LinkButton>
          ) : undefined
        }
      />
      <ProductForm key={product.id} product={product} />
    </>
  );
}

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequirePermission permission={Permission.CATALOG_WRITE} area="Catalog management">
      <EditProduct key={id} id={id} />
    </RequirePermission>
  );
}
