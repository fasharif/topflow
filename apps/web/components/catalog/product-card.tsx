import { STOCK_LABELS, UOM_LABELS, type ProductDto } from './labels';
import Link from 'next/link';
import { aed } from '@/lib/format';
import { Badge } from '../ui';
import { AddToCartButton } from './add-to-cart-button';

export function ProductImage({ product, className }: { product: Pick<ProductDto, 'imageUrl' | 'name'>; className?: string }) {
  if (product.imageUrl) {
    // Admin-supplied URLs from arbitrary hosts: a plain <img> avoids turning the image
    // optimizer into an open proxy.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={product.imageUrl} alt={product.name} loading="lazy" className={className ?? 'size-full object-cover'} />;
  }
  return (
    <div className="grid size-full place-items-center bg-gradient-to-br from-brand-50 to-sky-100 text-brand-600" aria-hidden="true">
      <svg viewBox="0 0 24 24" className="size-10 opacity-70" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 3c-3 4-6 7.5-6 11a6 6 0 0012 0c0-3.5-3-7-6-11z" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function PriceBlock({ product, trade }: { product: ProductDto; trade: boolean }) {
  if (trade) {
    const discounted = product.tradePrice !== null && product.tradePrice !== product.unitPrice;
    return (
      <div>
        <p className="text-lg font-bold text-ink-900">
          {aed(product.tradePrice ?? product.unitPrice)}
          <span className="ml-1 text-xs font-normal text-slate-500">/ {UOM_LABELS[product.uom]} excl. VAT</span>
        </p>
        {discounted && <p className="text-xs text-slate-400 line-through">List {aed(product.unitPrice)}</p>}
      </div>
    );
  }
  return (
    <p className="text-lg font-bold text-ink-900">
      {aed(product.retailPrice)}
      <span className="ml-1 text-xs font-normal text-slate-500">/ {UOM_LABELS[product.uom]} incl. VAT</span>
    </p>
  );
}

export function ProductCard({ product, trade }: { product: ProductDto; trade: boolean }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs transition hover:-translate-y-0.5 hover:shadow-md">
      <Link href={`/products/${product.slug}`} className="block aspect-[4/3] overflow-hidden">
        <ProductImage product={product} />
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <Badge tone={product.stockStatus === 'IN_STOCK' ? 'success' : 'warning'}>{STOCK_LABELS[product.stockStatus]}</Badge>
          {product.isTradeOnly && <Badge tone="brand">Trade only</Badge>}
        </div>
        <p className="font-mono text-xs text-slate-400">
          {product.sku}
          {product.brand ? ` · ${product.brand}` : ''}
        </p>
        <h3 className="mt-1 line-clamp-2 font-semibold text-ink-900">
          <Link href={`/products/${product.slug}`} className="hover:text-brand-700">
            {product.name}
          </Link>
        </h3>
        {product.minOrderQty > 1 && <p className="mt-1 text-xs text-slate-500">Minimum order: {product.minOrderQty}</p>}
        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <PriceBlock product={product} trade={trade} />
          <AddToCartButton product={product} compact />
        </div>
      </div>
    </article>
  );
}
