/**
 * Money maths in integer fils (1 AED = 100 fils) — never binary floating point.
 *
 * The prototype stored prices as `Int` and summed them on the device; v1 of this
 * platform used `Number` and Math.round. Both are fragile: 0.1 + 0.2 !== 0.3.
 * All server-side totals go through these helpers, and clients use the same code to
 * preview totals, so a cart can never disagree with the invoice it produces.
 */
import { VAT_RATE_BPS } from './constants';

export type Fils = number;

const DECIMAL_PATTERN = /^(-)?(\d+)(?:\.(\d{1,}))?$/;

/** Parses "45.5", "45.50", 45.5 or a Prisma Decimal-like value into fils (half-up to 2dp). */
export function toFils(value: string | number | { toString(): string }): Fils {
  const text = typeof value === 'number' ? value.toFixed(6) : value.toString().trim();
  const match = DECIMAL_PATTERN.exec(text);
  if (!match) {
    throw new RangeError(`Invalid money amount: "${text}"`);
  }
  const [, sign, whole = '0', fraction = ''] = match;
  const padded = (fraction + '000').slice(0, 3);
  let fils = Number(whole) * 100 + Number(padded.slice(0, 2));
  if (Number(padded[2]) >= 5) fils += 1;
  if (!Number.isSafeInteger(fils)) {
    throw new RangeError(`Money amount out of range: "${text}"`);
  }
  return sign ? -fils : fils;
}

/** Formats fils as a fixed 2dp decimal string suitable for Prisma Decimal columns ("45.50"). */
export function fromFils(fils: Fils): string {
  const sign = fils < 0 ? '-' : '';
  const abs = Math.abs(fils);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Applies a rate in basis points with half-up rounding (500 bps = 5%). */
export function applyRate(fils: Fils, rateBps: number): Fils {
  return Math.sign(fils) * Math.round((Math.abs(fils) * rateBps) / 10_000);
}

/** Converts a percentage ("12.5", 12.5) into basis points (1250). */
export function percentToBps(percent: string | number | { toString(): string }): number {
  return toFils(percent);
}

export function bpsToPercent(bps: number): string {
  return fromFils(bps);
}

/** Gross (VAT-inclusive) price for retail display. */
export function grossFromNet(netFils: Fils, vatRateBps: number = VAT_RATE_BPS): Fils {
  return netFils + applyRate(netFils, vatRateBps);
}

export interface LineInput {
  /** Net list price per unit, in fils. */
  listPriceFils: Fils;
  quantity: number;
  /** Line discount in basis points (0–10000). */
  discountBps?: number;
}

export interface LineAmounts {
  listPriceFils: Fils;
  unitPriceFils: Fils;
  quantity: number;
  discountBps: number;
  discountFils: Fils;
  lineSubtotalFils: Fils;
  vatFils: Fils;
  lineTotalFils: Fils;
}

/**
 * Prices one line. VAT is calculated per line (permitted by the UAE FTA) so that every
 * document shows line VAT that sums exactly to the document VAT.
 */
export function calculateLine(input: LineInput, vatRateBps: number = VAT_RATE_BPS): LineAmounts {
  const discountBps = input.discountBps ?? 0;
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    throw new RangeError(`Quantity must be a positive integer (got ${input.quantity})`);
  }
  if (discountBps < 0 || discountBps > 10_000) {
    throw new RangeError(`Discount must be between 0% and 100% (got ${discountBps} bps)`);
  }
  const unitPriceFils = input.listPriceFils - applyRate(input.listPriceFils, discountBps);
  const lineSubtotalFils = unitPriceFils * input.quantity;
  const discountFils = input.listPriceFils * input.quantity - lineSubtotalFils;
  const vatFils = applyRate(lineSubtotalFils, vatRateBps);
  return {
    listPriceFils: input.listPriceFils,
    unitPriceFils,
    quantity: input.quantity,
    discountBps,
    discountFils,
    lineSubtotalFils,
    vatFils,
    lineTotalFils: lineSubtotalFils + vatFils,
  };
}

export interface DocumentTotals {
  lines: LineAmounts[];
  subtotalFils: Fils;
  discountTotalFils: Fils;
  deliveryFeeFils: Fils;
  vatFils: Fils;
  totalFils: Fils;
}

/** Totals for a quotation / order. Delivery is a standard-rated supply, so it carries VAT too. */
export function calculateTotals(
  lines: LineInput[],
  options: { deliveryFeeFils?: Fils; vatRateBps?: number } = {},
): DocumentTotals {
  const vatRateBps = options.vatRateBps ?? VAT_RATE_BPS;
  const deliveryFeeFils = options.deliveryFeeFils ?? 0;
  const priced = lines.map((line) => calculateLine(line, vatRateBps));
  const subtotalFils = priced.reduce((sum, l) => sum + l.lineSubtotalFils, 0);
  const discountTotalFils = priced.reduce((sum, l) => sum + l.discountFils, 0);
  const vatFils = priced.reduce((sum, l) => sum + l.vatFils, 0) + applyRate(deliveryFeeFils, vatRateBps);
  return {
    lines: priced,
    subtotalFils,
    discountTotalFils,
    deliveryFeeFils,
    vatFils,
    totalFils: subtotalFils + deliveryFeeFils + vatFils,
  };
}

const aedFormatter = new Intl.NumberFormat('en-AE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "AED 1,234.50" — accepts fils (number) or a decimal string/Decimal. */
export function formatMoney(
  amount: Fils | string | { toString(): string },
  options: { currency?: string; inFils?: boolean } = {},
): string {
  const fils =
    typeof amount === 'number' && options.inFils !== false ? amount : toFils(amount as string);
  return `${options.currency ?? 'AED'} ${aedFormatter.format(fils / 100)}`;
}
