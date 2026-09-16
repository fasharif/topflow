import { RETAIL_FREE_DELIVERY_THRESHOLD_FILS, VAT_RATE_BPS, formatMoney, toFils } from '@topflow/shared';

const DUBAI = 'Asia/Dubai';
const NBSP = ' ';

/** "AED 1,234.50" from an API decimal string. */
export function aed(value: string): string {
  return formatMoney(value);
}

/** "AED 22.05 – 30.45" for an exact price range (the currency is shown once). */
export function aedRange(min: string, max: string): string {
  return min === max ? aed(min) : `${aed(min)} – ${aed(max).replace(/^AED\s*/, '')}`;
}

/**
 * A consumer price shown as an approximation: "≈ AED 22.05 – 30.45", or "≈ AED 22.05" when both
 * ends match. Non-breaking spaces keep each end together, so narrow cards only wrap before the dash.
 */
export function approxRange(min: string, max: string): string {
  const from = `≈${NBSP}${aed(min).replace(' ', NBSP)}`;
  return toFils(min) === toFils(max) ? from : `${from} –${NBSP}${aed(max).replace(/^AED\s*/, '')}`;
}

/** "5%" from basis points (500). */
export function percentFromBps(bps: number): string {
  return `${Number((bps / 100).toFixed(2))}%`;
}

/** Whole-dirham amount from fils without trailing zeros, e.g. "AED 500". */
export function aedFromFils(fils: number): string {
  return formatMoney(fils).replace(/\.00$/, '');
}

/** The UAE VAT rate as written in copy ("5%"). */
export const VAT_LABEL = percentFromBps(VAT_RATE_BPS);

/** Net retail order value from which delivery is free ("AED 500"). */
export const FREE_DELIVERY_LABEL = aedFromFils(RETAIL_FREE_DELIVERY_THRESHOLD_FILS);

export function formatDate(iso: string | null | undefined): string {
  return iso ? new Intl.DateTimeFormat('en-AE', { dateStyle: 'medium', timeZone: DUBAI }).format(new Date(iso)) : '—';
}

export function formatDateTime(iso: string | null | undefined): string {
  return iso
    ? new Intl.DateTimeFormat('en-AE', { dateStyle: 'medium', timeStyle: 'short', timeZone: DUBAI }).format(new Date(iso))
    : '—';
}

/** Today's date in the UAE as YYYY-MM-DD, for date inputs and "not in the past" checks. */
export function todayInDubai(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: DUBAI, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
