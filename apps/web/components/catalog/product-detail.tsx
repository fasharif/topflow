'use client';

import type { ProductDto } from '@topflow/shared';
import Link from 'next/link';
import { useApiQuery } from '@/lib/use-api';
import { useSession } from '@/lib/session';
import { Badge, Card, EmptyState, LinkButton, LoadingBlock } from '../ui';
import { AddToCartButton } from './add-to-cart-button';
import { STOCK_LABELS, UOM_LABELS } from './labels';
import { PriceBlock, ProductImage } from './product-card';

export function ProductDetail({ product: publicProduct, slug }: { product: ProductDto | null; slug: string }) {
  const { status, activeMembership } = useSession();
  // Trade members re-fetch in their organization context (trade price, trade-only items).
  const trade = useApiQuery<ProductDto>(activeMembership ? `/catalog/products/${encodeURIComponent(slug)}` : null, { org: true });
  const product = (activeMembership && trade.data) || publicProduct;

  if (!product) {
    if (status === 'loading' || (activeMembership && trade.loading)) return <LoadingBlock />;
    return (
      <EmptyState
        title="Product not found"
        description="This product may have been discontinued, or it is available to trade account holders only."
        action={<LinkButton href="/products">Browse the catalog</LinkButton>}
      />
    );
  }

  const tradeMode = Boolean(activeMembership && trade.data);
  const specs = Object.entries(product.specifications ?? {});

  return (
    <div>
      <nav className="mb-6 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link href="/products" className="hover:text-brand-700">
          Products
        </Link>
        {product.category && (
          <>
            {' / '}
            <Link href={`/products?category=${product.category.slug}`} className="hover:text-brand-700">
              {product.category.name}
            </Link>
          </>
        )}
      </nav>

      <div className="grid gap-10 lg:grid-cols-2">
        <div className="aspect-square overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <ProductImage product={product} />
        </div>

        <div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={product.stockStatus === 'IN_STOCK' ? 'success' : 'warning'}>{STOCK_LABELS[product.stockStatus]}</Badge>
            {product.isTradeOnly && <Badge tone="brand">Trade only</Badge>}
            {product.brand && <Badge>{product.brand}</Badge>}
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink-900">{product.name}</h1>
          <p className="mt-1 font-mono text-sm text-slate-500">SKU {product.sku}</p>

          <div className="mt-6">
            <PriceBlock product={product} trade={tradeMode} />
            {!tradeMode && <p className="mt-1 text-xs text-slate-500">Net {product.unitPrice} excl. VAT · sold per {UOM_LABELS[product.uom]}</p>}
          </div>

          <div className="mt-6">
            {product.isTradeOnly && !tradeMode ? (
              <p className="text-sm text-slate-600">This item is supplied to trade account holders on quotation.</p>
            ) : (
              <AddToCartButton product={product} />
            )}
            {product.minOrderQty > 1 && <p className="mt-2 text-xs text-slate-500">Minimum order quantity: {product.minOrderQty}</p>}
          </div>

          {product.description && <p className="mt-8 leading-relaxed text-slate-700">{product.description}</p>}

          {specs.length > 0 && (
            <Card className="mt-8 overflow-hidden">
              <table className="w-full text-sm">
                <caption className="border-b border-slate-100 px-4 py-3 text-left font-semibold text-ink-900">Specifications</caption>
                <tbody>
                  {specs.map(([key, value]) => (
                    <tr key={key} className="border-t border-slate-100 first:border-t-0">
                      <th scope="row" className="w-1/3 bg-slate-50 px-4 py-2 text-left font-medium text-slate-600">
                        {key}
                      </th>
                      <td className="px-4 py-2 text-ink-900">{String(value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {!activeMembership && (
            <p className="mt-8 text-sm text-slate-600">
              Buying for a project?{' '}
              <Link href="/register?type=business" className="font-medium text-brand-700 hover:underline">
                Open a trade account
              </Link>{' '}
              for negotiated prices, quotations and credit terms.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
