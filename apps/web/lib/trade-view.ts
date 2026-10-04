import { OrgStatus, type MembershipSummary, type ProductDto } from '@topflow/shared';

/**
 * Whether catalogue data re-fetched for an organisation member is that member's trade view, so the
 * page may show trade prices and the notice that goes with them.
 *
 * A successful re-fetch is not enough. The catalogue is public: when the API does not recognise the
 * caller as a member (the session expired while the page was open, or the membership has ended), it
 * answers 200 with the public data. The data itself is therefore checked against what the API sends
 * for the organisation's status: a verified (ACTIVE) organisation gets a `tradePrice` on every
 * product, and nobody else gets one.
 *
 * An organisation that is not verified gets list prices without a `tradePrice`, like the public, so
 * for it an expired session cannot be told apart from the data; the page then shows the same list
 * prices either way.
 */
export function isTradeView(
  membership: Pick<MembershipSummary, 'organizationStatus'> | null,
  products: ReadonlyArray<Pick<ProductDto, 'tradePrice'>> | undefined,
): boolean {
  if (!membership || !products) return false;
  if (membership.organizationStatus === OrgStatus.ACTIVE) {
    return products.length > 0 && products.every((product) => product.tradePrice !== null);
  }
  return products.every((product) => product.tradePrice === null);
}
