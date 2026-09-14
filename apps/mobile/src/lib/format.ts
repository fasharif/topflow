import {
  EMIRATE_LABELS,
  formatMoney,
  toFils,
  UOM_LABELS,
  type AddressDto,
  type OrderStatus,
  type ProductDto,
  type UnitOfMeasure,
} from '@topflow/shared';

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

// ─── Dates (always shown in UAE time) ────────────────────────────────────────

/** Asia/Dubai is UTC+4 all year round (no daylight saving). */
const UAE_OFFSET_MS = 4 * 60 * 60 * 1000;

function makeDubaiFormatter(options: Intl.DateTimeFormatOptions): (date: Date) => string {
  try {
    const formatter = new Intl.DateTimeFormat('en-AE', { ...options, timeZone: 'Asia/Dubai' });
    return (date) => formatter.format(date);
  } catch {
    // Engines without IANA time-zone data: shift to UAE time and format as UTC.
    const formatter = new Intl.DateTimeFormat('en-AE', { ...options, timeZone: 'UTC' });
    return (date) => formatter.format(new Date(date.getTime() + UAE_OFFSET_MS));
  }
}

const formatDubaiDateTime = makeDubaiFormatter({
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const formatDubaiDate = makeDubaiFormatter({ day: 'numeric', month: 'short', year: 'numeric' });

function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "14 Sept 2026, 3:05 pm" in Asia/Dubai. */
export function formatDateTime(iso: string | null | undefined): string {
  const date = parseDate(iso);
  return date ? formatDubaiDateTime(date) : '—';
}

/** "14 Sept 2026" in Asia/Dubai. */
export function formatDate(iso: string | null | undefined): string {
  const date = parseDate(iso);
  return date ? formatDubaiDate(date) : '—';
}

// ─── Catalog ─────────────────────────────────────────────────────────────────

export function stockInfo(
  product: Pick<ProductDto, 'stockStatus' | 'stockQuantity' | 'lowStockThreshold'>,
): { label: string; tone: Tone } {
  if (product.stockStatus === 'ON_ORDER') return { label: 'On order', tone: 'warning' };
  if (product.stockQuantity <= 0) return { label: 'Out of stock', tone: 'danger' };
  if (product.stockQuantity <= product.lowStockThreshold) return { label: 'Low stock', tone: 'warning' };
  return { label: 'In stock', tone: 'success' };
}

/** Online orders are accepted only when current stock covers the minimum order quantity. */
export function canPurchase(product: Pick<ProductDto, 'stockQuantity' | 'minOrderQty'>): boolean {
  return product.stockQuantity >= product.minOrderQty;
}

/** "per m", "per pc". */
export function perUnit(uom: UnitOfMeasure): string {
  return `per ${UOM_LABELS[uom]}`;
}

/** "25 m", "3 pc". */
export function quantityWithUnit(quantity: number, uom: UnitOfMeasure): string {
  return `${quantity} ${UOM_LABELS[uom]}`;
}

/**
 * "AED 12.00 – 15.00": the currency is written once, and a single amount is shown when both ends
 * match. Pass `' to '` as the separator for screen-reader text.
 */
export function formatMoneyRange(min: string, max: string, separator = ' – '): string {
  const a = toFils(min);
  const b = toFils(max);
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  if (low === high) return formatMoney(low);
  return `${formatMoney(low)}${separator}${formatMoney(high, { currency: '' }).trim()}`;
}

/** Spoken price for accessibility labels, including the approximate range when there is one. */
export function priceAccessibilityLabel(product: Pick<ProductDto, 'retailPrice' | 'priceRange'>): string {
  const online = formatMoney(product.retailPrice);
  if (!product.priceRange) return `${online} including VAT`;
  const { retailMin, retailMax } = product.priceRange;
  return `approximately ${formatMoneyRange(retailMin, retailMax, ' to ')} including VAT, or ${online} to buy online`;
}

// ─── Orders & addresses ──────────────────────────────────────────────────────

export function orderStatusTone(status: OrderStatus): Tone {
  switch (status) {
    case 'DELIVERED':
      return 'success';
    case 'CANCELLED':
      return 'danger';
    case 'PENDING_PAYMENT':
      return 'warning';
    default:
      return 'info';
  }
}

/** "Villa 12, Street 5, Al Barsha, Dubai, Dubai". */
export function formatAddress(address: Pick<AddressDto, 'line1' | 'line2' | 'area' | 'city' | 'emirate'>): string {
  return [address.line1, address.line2, address.area, address.city, EMIRATE_LABELS[address.emirate]]
    .filter((part): part is string => Boolean(part))
    .join(', ');
}

// ─── Text ────────────────────────────────────────────────────────────────────

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
