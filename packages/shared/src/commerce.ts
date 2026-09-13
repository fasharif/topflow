import type { Fils } from './money';

/** Retail delivery policy — shared so the cart preview and the server-side invoice agree. */
export const RETAIL_DELIVERY_FEE_FILS: Fils = 25_00;
export const RETAIL_FREE_DELIVERY_THRESHOLD_FILS: Fils = 500_00;

/** Delivery charge (net of VAT) for a retail order with the given net subtotal. */
export function retailDeliveryFeeFils(netSubtotalFils: Fils): Fils {
  return netSubtotalFils >= RETAIL_FREE_DELIVERY_THRESHOLD_FILS ? 0 : RETAIL_DELIVERY_FEE_FILS;
}
