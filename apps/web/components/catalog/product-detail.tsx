'use client';

import { UOM_LABELS, type ProductDto } from '@topflow/shared';
import { Building, Check, FilePlus, PackageSearch, ShoppingBasket } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { addToCart } from '@/lib/cart';
import { FREE_DELIVERY_LABEL, VAT_LABEL, aed } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useApiQuery } from '@/lib/use-api';
import { Badge, Breadcrumbs, Button, Card, EmptyState, LinkButton, LoadingBlock, QuantityInput, SectionHeading } from '../ui';
import { ProductCard, ProductImage, ProductPrice, StockBadge, productSize } from './product-card';

const ASSURANCES = [
  `Consumer prices include ${VAT_LABEL} UAE VAT`,
  `Free delivery on retail orders over ${FREE_DELIVERY_LABEL}`,
  'Pay by cash or card on delivery',
  'Formal PDF quotations for projects',
];

interface AddedNotice {
  target: 'quote' | 'basket';
  quantity: number;
}

/** Quantity, "Add to quote" (primary) and "Add to basket" to buy at the listed price. Both use the chosen quantity. */
function PurchasePanel({ product, tradeMode }: { product: ProductDto; tradeMode: boolean }) {
  const [quantity, setQuantity] = useState(product.minOrderQty);
  const [notice, setNotice] = useState<AddedNotice | null>(null);
  const unit = UOM_LABELS[product.uom];
  const canBuy = !product.isTradeOnly || tradeMode;
  const quantityId = `quantity-${product.id}`;
  const minimumId = `minimum-${product.id}`;

  const add = (target: AddedNotice['target']) => {
    addToCart(product, quantity);
    setNotice({ target, quantity });
  };

  // Trade members send quote requests (RFQs) from their basket.
  const toQuote = notice?.target === 'quote' && !tradeMode;

  return (
    <Card className="mt-6 p-5 sm:p-6">
      <ProductPrice product={product} trade={tradeMode} size="lg" />
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        {tradeMode ? (
          'Your negotiated trade price. Request a quotation from your basket for project quantities.'
        ) : canBuy ? (
          <>
            Buy online now at <strong className="font-semibold text-ink-900">{aed(product.retailPrice)}</strong> per {unit} incl. VAT, or request a quote
            for your best price.
          </>
        ) : (
          'This item is supplied to trade account holders on quotation.'
        )}
      </p>

      <div className="mt-5 border-t border-slate-200 pt-5">
        <label htmlFor={quantityId} className="block text-sm font-medium text-ink-900">
          Quantity
        </label>
        <div className="mt-2 flex items-center gap-3">
          <QuantityInput
            id={quantityId}
            label="Quantity"
            value={quantity}
            min={product.minOrderQty}
            onChange={setQuantity}
            aria-describedby={product.minOrderQty > 1 ? minimumId : undefined}
          />
          <span className="text-sm text-slate-600">{unit}</span>
        </div>
        {product.minOrderQty > 1 && (
          <p id={minimumId} className="mt-2 text-xs text-slate-600">
            Minimum order quantity: {product.minOrderQty} {unit}
          </p>
        )}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Button size="lg" className="sm:flex-1" onClick={() => add('quote')}>
            <FilePlus aria-hidden="true" />
            Add to quote
          </Button>
          {canBuy && (
            <Button size="lg" variant="secondary" className="sm:flex-1" onClick={() => add('basket')}>
              <ShoppingBasket aria-hidden="true" />
              Add to basket
            </Button>
          )}
        </div>

        <div role="status">
          {notice && (
            <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-success-200 bg-success-50 px-3 py-2.5 text-sm text-success-900">
              <Check aria-hidden="true" className="size-4 shrink-0 text-success-600" />
              <span>
                Added {notice.quantity} {unit} to your {toQuote ? 'quote' : 'basket'}.
              </span>
              <Link href={toQuote ? '/quote' : '/cart'} className="font-semibold underline underline-offset-4 hover:no-underline">
                {toQuote ? 'View quote' : 'View basket'}
              </Link>
            </p>
          )}
        </div>
      </div>
    </Card>
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
        icon={<PackageSearch aria-hidden="true" />}
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
      <Breadcrumbs
        className="mb-6"
        items={[
          { label: 'Catalogue', href: '/products' },
          ...(product.category ? [{ label: product.category.name, href: `/products?category=${product.category.slug}` }] : []),
          { label: product.name },
        ]}
      />

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-14">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <div className="aspect-square overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
            <ProductImage product={product} priority className="size-full object-contain p-8 sm:p-10" />
          </div>
        </div>

        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-sm text-slate-600">
            <span>SKU {product.sku}</span>
            {product.brand && (
              <>
                <span aria-hidden="true">·</span>
                <span>{product.brand}</span>
              </>
            )}
          </p>
          <h1 className="heading-1 mt-2">{product.name}</h1>
          {size && <p className="mt-2 text-base text-slate-700">{size}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <StockBadge status={product.stockStatus} />
            {product.isTradeOnly && <Badge tone="brand">Trade only</Badge>}
          </div>

          <PurchasePanel key={product.id} product={product} tradeMode={tradeMode} />

          <ul className="mt-6 grid gap-2.5 text-sm text-slate-700 sm:grid-cols-2">
            {ASSURANCES.map((item) => (
              <li key={item} className="flex gap-2.5">
                <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-600" />
                {item}
              </li>
            ))}
          </ul>

          {product.description && <p className="mt-8 text-base leading-relaxed text-slate-700">{product.description}</p>}

          {specs.length > 0 && (
            <section className="mt-8" aria-labelledby="specifications-heading">
              <h2 id="specifications-heading" className="heading-3">
                Specifications
              </h2>
              <dl className="mt-3 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white text-sm">
                {size && (
                  <div className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4">
                    <dt className="text-slate-600">Size</dt>
                    <dd className="text-ink-900">{size}</dd>
                  </div>
                )}
                {specs.map(([key, value]) => (
                  <div key={key} className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4">
                    <dt className="text-slate-600">{key}</dt>
                    <dd className="break-words text-ink-900">
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
                <div className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4">
                  <dt className="text-slate-600">Sold per</dt>
                  <dd className="text-ink-900">{unit}</dd>
                </div>
              </dl>
            </section>
          )}

          {!activeMembership && (
            <Card tone="brand" className="mt-8 flex gap-4 p-5">
              <Building aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand-700" />
              <p className="text-sm leading-relaxed text-slate-700">
                Buying for a project?{' '}
                <Link href="/register?type=business" className="font-semibold text-brand-700 underline-offset-4 hover:underline">
                  Open a trade account
                </Link>{' '}
                for negotiated prices, quotations and credit terms.
              </p>
            </Card>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-16 border-t border-slate-200 pt-12" aria-labelledby="related-heading">
          <SectionHeading
            id="related-heading"
            title={`More from ${product.category?.name ?? 'this range'}`}
            action={product.category ? { href: `/products?category=${product.category.slug}`, label: 'View all' } : undefined}
          />
          <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((item) => (
              <li key={item.id}>
                <ProductCard product={item} trade={false} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
