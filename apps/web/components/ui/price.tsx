import { UOM_LABELS, type UnitOfMeasure } from '@topflow/shared';
import { VAT_LABEL, aed, approxRange } from '@/lib/format';
import { cx } from './cx';
import { InfoTooltip } from './tooltip';

export const APPROX_PRICE_NOTE = `Indicative market price including ${VAT_LABEL} VAT. Request a quote for your best price — project quantities are priced individually.`;

export type PriceSize = 'sm' | 'md' | 'lg';

const amountSizes: Record<PriceSize, string> = {
  sm: 'text-base',
  md: 'text-lg',
  lg: 'text-2xl tracking-tight sm:text-3xl',
};

/** Consumer price: an approximate VAT-inclusive range ("≈ AED 22.05 – 30.45") with an explanation. */
export function ApproxPrice({
  min,
  max,
  uom,
  size = 'md',
  className,
}: {
  min: string;
  max: string;
  uom: UnitOfMeasure;
  size?: PriceSize;
  className?: string;
}) {
  return (
    <div className={cx('relative', className)}>
      <div className="flex items-center gap-1">
        <p className="eyebrow text-slate-600">Approx. price</p>
        <InfoTooltip label="About approximate prices" anchor="parent">
          {APPROX_PRICE_NOTE}
        </InfoTooltip>
      </div>
      <p className={cx('mt-0.5 font-semibold tabular-nums text-ink-900', amountSizes[size])}>{approxRange(min, max)}</p>
      <p className="text-xs text-slate-600">per {UOM_LABELS[uom]} · incl. VAT</p>
    </div>
  );
}

/** Exact price for signed-in trade members, excluding VAT, with the list price struck through when discounted. */
export function TradePrice({
  price,
  listPrice,
  uom,
  size = 'md',
  className,
}: {
  price: string;
  /** Catalogue list price; shown struck through when it differs from `price`. */
  listPrice?: string | null;
  uom: UnitOfMeasure;
  size?: PriceSize;
  className?: string;
}) {
  const discounted = listPrice !== undefined && listPrice !== null && listPrice !== price;
  return (
    <div className={className}>
      <p className="eyebrow text-slate-600">Trade price</p>
      <p className={cx('mt-0.5 font-semibold tabular-nums text-ink-900', amountSizes[size])}>
        {aed(price)}
        <span className="ml-1 text-xs font-normal tracking-normal text-slate-600">/ {UOM_LABELS[uom]} excl. VAT</span>
      </p>
      {discounted && (
        <p className="text-xs text-slate-600">
          <s>List {aed(listPrice)}</s>
        </p>
      )}
    </div>
  );
}
