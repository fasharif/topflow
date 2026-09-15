import {
  OrgStatus,
  applyRate,
  fromFils,
  grossFromNet,
  percentToBps,
  toFils,
  type Fils,
} from '@topflow/shared';
import type { OrganizationContext } from '../common/request-context';

type DecimalLike = { toString(): string };

/** Pricing inputs derived from who is asking. */
export interface PricingContext {
  /** Trade discount in basis points; null for retail shoppers and unverified organizations. */
  tradeDiscountBps: number | null;
}

export const RETAIL_PRICING: PricingContext = { tradeDiscountBps: null };

export function pricingContextFor(
  organization: OrganizationContext | null | undefined,
): PricingContext {
  if (!organization || organization.organizationStatus !== OrgStatus.ACTIVE) {
    return RETAIL_PRICING;
  }
  return { tradeDiscountBps: percentToBps(organization.discountRate) };
}

/** Consumer-facing price: UAE law requires prices shown to consumers to include VAT. */
export function retailPrice(unitPrice: DecimalLike): string {
  return fromFils(grossFromNet(toFils(unitPrice)));
}

/** Net unit price after the organization's negotiated discount (excl. VAT). */
export function tradeUnitPriceFils(
  unitPrice: DecimalLike,
  context: PricingContext,
): Fils {
  const list = toFils(unitPrice);
  return context.tradeDiscountBps === null
    ? list
    : list - applyRate(list, context.tradeDiscountBps);
}

export function tradePrice(
  unitPrice: DecimalLike,
  context: PricingContext,
): string | null {
  return context.tradeDiscountBps === null
    ? null
    : fromFils(tradeUnitPriceFils(unitPrice, context));
}
