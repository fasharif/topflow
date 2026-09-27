import {
  calculateTotals,
  fromFils,
  PaymentMethod,
  RETAIL_FREE_DELIVERY_THRESHOLD_FILS,
  retailDeliveryFeeFils,
  toFils,
  type DocumentTotals,
  type Fils,
  type ProductDto,
  type UnitOfMeasure,
} from '@topflow/shared';

/**
 * The cart's money rules, kept free of React Native so they can be unit tested with Node
 * (cart-pricing.spec.ts). The cart store (cart.ts) and the checkout use them.
 */

export interface CartLine {
  productId: string;
  sku: string;
  slug: string;
  name: string;
  /** Catalogue image as returned by the API (may be site-relative); resolved when rendered. */
  imageUrl: string | null;
  uom: UnitOfMeasure;
  /** Net unit price (excl. VAT) as a decimal string. */
  unitPrice: string;
  /** VAT-inclusive unit price as a decimal string. */
  retailPrice: string;
  minOrderQty: number;
  quantity: number;
}

export interface CartTotals extends DocumentTotals {
  /** Net amount still needed to qualify for free delivery (0 when it already applies). */
  freeDeliveryRemainingFils: Fils;
}

/** Previews totals with the same money maths and delivery policy the API uses to invoice. */
export function cartTotals(lines: readonly CartLine[]): CartTotals {
  const inputs = lines.map((line) => ({ listPriceFils: toFils(line.unitPrice), quantity: line.quantity }));
  const netSubtotalFils = inputs.reduce((sum, line) => sum + line.listPriceFils * line.quantity, 0);
  const totals = calculateTotals(inputs, { deliveryFeeFils: retailDeliveryFeeFils(netSubtotalFils) });
  return {
    ...totals,
    freeDeliveryRemainingFils:
      totals.deliveryFeeFils > 0 ? Math.max(0, RETAIL_FREE_DELIVERY_THRESHOLD_FILS - netSubtotalFils) : 0,
  };
}

/** The body of `POST /me/orders` for these lines, paid on delivery. */
export interface CheckoutRequest {
  items: { productId: string; quantity: number }[];
  addressId: string;
  paymentMethod: typeof PaymentMethod.CASH_ON_DELIVERY;
  notes?: string;
  /** The total (VAT included) shown in the cart, as a decimal string. */
  expectedTotal: string;
}

/**
 * The order request for a cart. Only products and quantities are sent, because the server prices
 * every line, delivery and VAT itself. `expectedTotal` is the total the cart shows: when the
 * server's own total differs (a price changed after the product was added), the API refuses the
 * order with 409 PRICE_CHANGED instead of charging an amount the customer was not shown (BUG-02).
 */
export function checkoutRequest(
  lines: readonly CartLine[],
  options: { addressId: string; notes?: string },
): CheckoutRequest {
  return {
    items: lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
    addressId: options.addressId,
    paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
    ...(options.notes === undefined ? {} : { notes: options.notes }),
    expectedTotal: fromFils(cartTotals(lines).totalFils),
  };
}

/**
 * Replaces the catalogue fields cached on each line (name, prices, unit, minimum order) with the
 * product as the catalogue shows it now. `products` holds the current product for each line, or
 * `null` when it could not be loaded; such lines are kept as they are and listed in `unchecked`.
 * `changed` is false, and `lines` the same array, when nothing differs.
 */
export function withCataloguePrices(
  lines: readonly CartLine[],
  products: ReadonlyMap<string, ProductDto | null>,
): { lines: readonly CartLine[]; changed: boolean; unchecked: string[] } {
  const unchecked: string[] = [];
  let changed = false;
  const next = lines.map((line) => {
    const product = products.get(line.productId);
    if (!product) {
      unchecked.push(line.productId);
      return line;
    }
    const minOrderQty = Math.max(1, product.minOrderQty);
    const updated: CartLine = {
      productId: line.productId,
      sku: product.sku,
      slug: product.slug,
      name: product.name,
      imageUrl: product.imageUrl,
      uom: product.uom,
      unitPrice: product.unitPrice,
      retailPrice: product.retailPrice,
      minOrderQty,
      quantity: Math.max(line.quantity, minOrderQty),
    };
    const same = (Object.keys(updated) as (keyof CartLine)[]).every((key) => updated[key] === line[key]);
    if (same) return line;
    changed = true;
    return updated;
  });
  return { lines: changed ? next : lines, changed, unchecked };
}
