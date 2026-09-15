import { formatMoney } from '@topflow/shared';

const DUBAI = 'Asia/Dubai';

/** "AED 1,234.50" from an API decimal string. */
export function aed(value: string): string {
  return formatMoney(value);
}

/** "AED 22.05 – 30.45" for an indicative price range (the currency is shown once). */
export function aedRange(min: string, max: string): string {
  return min === max ? aed(min) : `${aed(min)} – ${aed(max).replace(/^AED\s*/, '')}`;
}

export function formatDate(iso: string | null | undefined): string {
  return iso ? new Intl.DateTimeFormat('en-AE', { dateStyle: 'medium', timeZone: DUBAI }).format(new Date(iso)) : '—';
}

export function formatDateTime(iso: string | null | undefined): string {
  return iso
    ? new Intl.DateTimeFormat('en-AE', { dateStyle: 'medium', timeStyle: 'short', timeZone: DUBAI }).format(new Date(iso))
    : '—';
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
