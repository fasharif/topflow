'use client';

import type { ProductDto } from '@topflow/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { addToCart, useCart } from '@/lib/cart';
import { aed } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api';
import { useSession } from '@/lib/session';
import { Badge, Button, EmptyState, LinkButton, LoadingBlock } from '../ui';
import { AddToCartButton } from './add-to-cart-button';
import { STOCK_LABELS, UOM_LABELS } from './labels';
import { PriceBlock, ProductCard, ProductImage, productSize } from './product-card';

const ASSURANCES = [
  'Consumer prices include 5% UAE VAT',
  'Free delivery on retail orders over AED 500',
  'Pay by cash or card on delivery',
  'Formal PDF quotations for projects',
];

/** Adds the product (if needed) and opens the quote request; trade members use their RFQ in the basket. */
function QuoteButton({ product, trade }: { product: ProductDto; trade: boolean }) {
  const router = useRouter();
  const { lines } = useCart();
  return (
    <Button
      variant="secondary"
      size="lg"
      onClick={() => {
        if (!lines.some((line) => line.productId === product.id)) addToCart(product);
        router.push(trade ? '/cart' : '/quote');
      }}
    >
      Request a quote
    </Button>
  );
}

export function ProductDetail({ product: publicProduct, slug, related }: { product: ProductDto | null; slug: string; related: ProductDto[] }) {
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
        action={<LinkButton href="/products">Browse the catalogue</LinkButton>}
      />
    );
  }

  const tradeMode = Boolean(activeMembership && trade.data);
  const unit = UOM_LABELS[product.uom];
  const size = productSize(product);
  const specs = Object.entries(product.specifications ?? {}).filter(([key]) => key !== 'Size');

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-8 font-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">
        <Link href="/products" className="hover:text-brand-600">
          Catalogue
        </Link>
        {product.category && (
          <>
            {' / '}
            <Link href={`/products?category=${product.category.slug}`} className="hover:text-brand-600">
              {product.category.name}
            </Link>
          </>
        )}
      </nav>

      <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <div className="aspect-square overflow-hidden rounded-3xl border border-slate-200 bg-white">
            <ProductImage product={product} className="size-full object-contain p-10" />
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-slate-300 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-600">
              {product.brand ?? 'Top Flow'}
            </span>
            <Badge tone={product.stockStatus === 'IN_STOCK' ? 'success' : 'neutral'}>{STOCK_LABELS[product.stockStatus]}</Badge>
            {product.isTradeOnly && <Badge tone="brand">Trade only</Badge>}
          </div>
          <h1 className="mt-4 font-display text-4xl leading-tight tracking-tight text-ink-900 sm:text-5xl">{product.name}</h1>
          <p className="mt-3 font-mono text-xs text-slate-500">SKU {product.sku}</p>
          {size && <p className="mt-2 text-slate-700">{size}</p>}

          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
            <PriceBlock product={product} trade={tradeMode} size="lg" />
            {!tradeMode && product.priceRange && (
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Buy online at <strong className="font-semibold text-ink-900">{aed(product.retailPrice)}</strong> per {unit}, or request a quote for your
                best price. Project quantities are priced individually.
              </p>
            )}
            {tradeMode && <p className="mt-2 text-sm text-slate-600">Your negotiated trade price. Request a quotation from your basket for project quantities.</p>}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {product.isTradeOnly && !tradeMode ? (
                <p className="text-sm text-slate-600">This item is supplied to trade account holders on quotation.</p>
              ) : (
                <AddToCartButton product={product} />
              )}
              <QuoteButton product={product} trade={tradeMode} />
            </div>
            {product.minOrderQty > 1 && (
              <p className="mt-3 text-xs text-slate-500">
                Minimum order quantity: {product.minOrderQty} {unit}
              </p>
            )}
          </div>

          <ul className="mt-6 grid gap-2.5 text-sm text-slate-600 sm:grid-cols-2">
            {ASSURANCES.map((item) => (
              <li key={item} className="flex gap-2.5">
                <svg viewBox="0 0 20 20" className="mt-0.5 size-4 shrink-0 text-brand-600" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {item}
              </li>
            ))}
          </ul>

          {product.description && <p className="mt-10 text-lg leading-relaxed text-slate-700">{product.description}</p>}

          {specs.length > 0 && (
            <div className="mt-10">
              <h2 className="eyebrow text-brand-600">Specifications</h2>
              <dl className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
                {size && (
                  <div className="grid gap-1 py-3 sm:grid-cols-[180px_1fr]">
                    <dt className="text-sm text-slate-500">Size</dt>
                    <dd className="text-sm text-ink-900">{size}</dd>
                  </div>
                )}
                {specs.map(([key, value]) => (
                  <div key={key} className="grid gap-1 py-3 sm:grid-cols-[180px_1fr]">
                    <dt className="text-sm text-slate-500">{key}</dt>
                    <dd className="text-sm text-ink-900">
                      {key === 'Details' && typeof value === 'string' && value.includes(';') ? (
                        <ul className="list-disc space-y-1 pl-4">
                          {value
                            .split(/;\s*/)
                            .filter(Boolean)
                            .map((part) => (
                              <li key={part}>{part}</li>
                            ))}
                        </ul>
                      ) : (
                        String(value)
                      )}
                    </dd>
                  </div>
                ))}
                <div className="grid gap-1 py-3 sm:grid-cols-[180px_1fr]">
                  <dt className="text-sm text-slate-500">Sold per</dt>
                  <dd className="text-sm text-ink-900">{unit}</dd>
                </div>
              </dl>
            </div>
          )}

          {!activeMembership && (
            <p className="mt-10 rounded-2xl bg-brand-50 p-5 text-sm text-slate-700">
              Buying for a project?{' '}
              <Link href="/register?type=business" className="font-medium text-brand-700 underline-offset-4 hover:underline">
                Open a trade account
              </Link>{' '}
              for negotiated prices, quotations and credit terms.
            </p>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-24 border-t border-slate-200 pt-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="font-display text-3xl tracking-tight text-ink-900">More from {product.category?.name ?? 'this range'}</h2>
            {product.category && (
              <Link href={`/products?category=${product.category.slug}`} className="font-medium text-brand-600 hover:underline">
                View all →
              </Link>
            )}
          </div>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} trade={false} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
