import { STOCK_LABELS, UOM_LABELS, type ProductDto } from './labels';
import Link from 'next/link';
import { aed, aedRange } from '@/lib/format';
import { Badge, cx } from '../ui';
import { AddToCartButton } from './add-to-cart-button';

export function ProductImage({ product, className }: { product: Pick<ProductDto, 'imageUrl' | 'name'>; className?: string }) {
  if (product.imageUrl) {
    // Catalogue photos are pre-optimised WebP files, and admin-supplied URLs can point to any host,
    // so a plain <img> is used rather than turning the image optimiser into an open proxy.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={product.imageUrl} alt={product.name} loading="lazy" decoding="async" className={className ?? 'size-full object-contain p-5'} />;
  }
  return (
    <div className="grid size-full place-items-center bg-sand-100 text-brand-600/50" aria-hidden="true">
      <svg viewBox="0 0 24 24" className="size-10" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 3c-3 4-6 7.5-6 11a6 6 0 0012 0c0-3.5-3-7-6-11z" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/** The size or variant a product is sold in, when the catalogue records one. */
export function productSize(product: Pick<ProductDto, 'specifications'>): string | null {
  const size = product.specifications?.Size;
  return typeof size === 'string' && size.trim() ? size : null;
}

export function PriceBlock({ product, trade, size = 'md' }: { product: ProductDto; trade: boolean; size?: 'md' | 'lg' }) {
  const unit = UOM_LABELS[product.uom];
  const amountClass = cx('font-semibold tabular-nums text-ink-900', size === 'lg' ? 'text-3xl tracking-tight' : 'text-base');

  if (trade) {
    const discounted = product.tradePrice !== null && product.tradePrice !== product.unitPrice;
    return (
      <div>
        <p className={amountClass}>
          {aed(product.tradePrice ?? product.unitPrice)}
          <span className="ml-1 text-xs font-normal text-slate-500">/ {unit} excl. VAT</span>
        </p>
        {discounted && <p className="text-xs text-slate-500 line-through">List {aed(product.unitPrice)}</p>}
      </div>
    );
  }

  if (product.priceRange) {
    return (
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">Approx. price</p>
        <p className={amountClass}>{aedRange(product.priceRange.retailMin, product.priceRange.retailMax)}</p>
        <p className="text-xs text-slate-500">per {unit} · incl. VAT</p>
      </div>
    );
  }

  return (
    <p className={amountClass}>
      {aed(product.retailPrice)}
      <span className="ml-1 text-xs font-normal text-slate-500">/ {unit} incl. VAT</span>
    </p>
  );
}

export function ProductCard({ product, trade }: { product: ProductDto; trade: boolean }) {
  const size = productSize(product);
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_18px_40px_-24px_rgba(18,33,27,0.45)]">
      <Link href={`/products/${product.slug}`} className="block aspect-square overflow-hidden border-b border-slate-100 bg-white" tabIndex={-1} aria-hidden="true">
        <ProductImage product={product} className="size-full object-contain p-5 transition duration-300 group-hover:scale-[1.04]" />
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-slate-300 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-600">
            {product.brand ?? 'Top Flow'}
          </span>
          <Badge tone={product.stockStatus === 'IN_STOCK' ? 'success' : 'neutral'}>{STOCK_LABELS[product.stockStatus]}</Badge>
          {product.isTradeOnly && <Badge tone="brand">Trade only</Badge>}
        </div>
        <h3 className="line-clamp-2 font-semibold leading-snug text-ink-900">
          <Link href={`/products/${product.slug}`} className="hover:text-brand-600">
            {product.name}
          </Link>
        </h3>
        <p className="mt-1 truncate font-mono text-[11px] text-slate-500">
          {product.sku}
          {product.category ? ` · ${product.category.name}` : ''}
        </p>
        {size && <p className="mt-1.5 line-clamp-1 text-xs text-slate-600">{size}</p>}
        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <PriceBlock product={product} trade={trade} />
          <AddToCartButton product={product} compact />
        </div>
      </div>
    </article>
  );
}
