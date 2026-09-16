import type { ProductDto } from '@topflow/shared';
import { Clock, Droplet, PackageCheck } from 'lucide-react';
import Link from 'next/link';
import { ApproxPrice, Badge, TradePrice, type PriceSize } from '../ui';
import { STOCK_LABELS } from './labels';
import { QuoteAction } from './quote-action';

export function ProductImage({
  product,
  className,
  alt,
  priority = false,
}: {
  product: Pick<ProductDto, 'imageUrl' | 'name'>;
  className?: string;
  /** Defaults to the product name; pass "" when a link or heading next to it already names the product. */
  alt?: string;
  /** Loads eagerly with high priority, for the main image above the fold. */
  priority?: boolean;
}) {
  if (product.imageUrl) {
    // Catalogue photos are pre-optimised WebP files, and admin-supplied URLs can point to any host,
    // so a plain <img> is used rather than turning the image optimiser into an open proxy.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={product.imageUrl}
        alt={alt ?? product.name}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        decoding="async"
        className={className ?? 'size-full object-contain p-5'}
      />
    );
  }
  return (
    <div className="grid size-full place-items-center bg-slate-50 text-slate-400" aria-hidden="true">
      <Droplet className="size-10" />
    </div>
  );
}

/** The size or variant a product is sold in, when the catalogue records one. */
export function productSize(product: Pick<ProductDto, 'specifications'>): string | null {
  const size = product.specifications?.Size;
  return typeof size === 'string' && size.trim() ? size : null;
}

export function StockBadge({ status }: { status: ProductDto['stockStatus'] }) {
  return status === 'IN_STOCK' ? (
    <Badge tone="success">
      <PackageCheck aria-hidden="true" />
      {STOCK_LABELS.IN_STOCK}
    </Badge>
  ) : (
    <Badge tone="neutral">
      <Clock aria-hidden="true" />
      {STOCK_LABELS.ON_ORDER}
    </Badge>
  );
}

/**
 * The price shown for a product: exact trade prices for signed-in trade members, otherwise the
 * approximate VAT-inclusive consumer range (a single "≈" price when the product has no range).
 */
export function ProductPrice({ product, trade, size = 'md', className }: { product: ProductDto; trade: boolean; size?: PriceSize; className?: string }) {
  if (trade) {
    return (
      <TradePrice
        price={product.tradePrice ?? product.unitPrice}
        listPrice={product.tradePrice !== null ? product.unitPrice : null}
        uom={product.uom}
        size={size}
        className={className}
      />
    );
  }
  return (
    <ApproxPrice
      min={product.priceRange?.retailMin ?? product.retailPrice}
      max={product.priceRange?.retailMax ?? product.retailPrice}
      uom={product.uom}
      size={size}
      className={className}
    />
  );
}

export function ProductCard({ product, trade }: { product: ProductDto; trade: boolean }) {
  const size = productSize(product);
  const href = `/products/${product.slug}`;
  return (
    <article className="group flex h-full flex-col rounded-xl border border-slate-200 bg-white shadow-xs transition-[border-color,box-shadow] hover:border-slate-300 hover:shadow-raised">
      <Link href={href} tabIndex={-1} aria-hidden="true" className="block aspect-[4/3] overflow-hidden rounded-t-xl border-b border-slate-100 bg-white sm:aspect-square">
        <ProductImage
          product={product}
          alt=""
          className="size-full object-contain p-5 transition-transform duration-300 motion-safe:group-hover:scale-[1.03]"
        />
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <p className="flex min-w-0 items-center gap-1.5 font-mono text-xs text-slate-600">
          <span className="truncate">{product.sku}</span>
          {product.brand && (
            <>
              <span aria-hidden="true">·</span>
              <span className="truncate">{product.brand}</span>
            </>
          )}
        </p>
        <h3 className="heading-4 mt-1.5 line-clamp-2">
          <Link href={href} className="rounded-sm hover:text-brand-700">
            {product.name}
          </Link>
        </h3>
        {size && <p className="mt-1 line-clamp-1 text-sm text-slate-600">{size}</p>}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <StockBadge status={product.stockStatus} />
          {product.isTradeOnly && <Badge tone="brand">Trade only</Badge>}
        </div>
        <div className="mt-auto pt-5">
          <ProductPrice product={product} trade={trade} />
          <QuoteAction product={product} trade={trade} className="mt-4" />
        </div>
      </div>
    </article>
  );
}
