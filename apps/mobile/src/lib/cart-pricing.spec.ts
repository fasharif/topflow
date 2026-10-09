/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { UnitOfMeasure, type ProductDto } from '@topflow/shared';

import { cartTotals, checkoutRequest, withCataloguePrices, type CartLine } from './cart-pricing';

// Run with `npm test -w mobile` (Node's test runner through tsx; needs @topflow/shared built).

function line(overrides: Partial<CartLine> = {}): CartLine {
  return {
    productId: '11111111-1111-4111-8111-111111111111',
    sku: 'AX-EFS-002',
    slug: 'electrofusion-tee-50-mm',
    name: 'Electrofusion Tee (50 mm)',
    imageUrl: null,
    uom: UnitOfMeasure.PIECE,
    unitPrice: '39.00',
    retailPrice: '40.95',
    minOrderQty: 1,
    quantity: 2,
    ...overrides,
  };
}

/** The catalogue's current view of a cart line's product. */
function product(from: CartLine, overrides: Partial<ProductDto> = {}): ProductDto {
  return {
    id: from.productId,
    sku: from.sku,
    slug: from.slug,
    name: from.name,
    imageUrl: from.imageUrl,
    uom: from.uom,
    unitPrice: from.unitPrice,
    retailPrice: from.retailPrice,
    minOrderQty: from.minOrderQty,
    ...overrides,
  } as ProductDto;
}

describe('cartTotals', () => {
  it('adds delivery and VAT as the API does, worked by hand', () => {
    // 2 × 39.00 = 78.00 net; below AED 500, so AED 25.00 delivery; 5 % VAT on both: 3.90 + 1.25.
    const totals = cartTotals([line()]);
    assert.equal(totals.subtotalFils, 7800);
    assert.equal(totals.deliveryFeeFils, 2500);
    assert.equal(totals.vatFils, 515);
    assert.equal(totals.totalFils, 10815);
    assert.equal(totals.freeDeliveryRemainingFils, 42200);
  });

  it('delivers free from AED 500 net', () => {
    const totals = cartTotals([line({ unitPrice: '500.00', retailPrice: '525.00', quantity: 1 })]);
    assert.equal(totals.deliveryFeeFils, 0);
    assert.equal(totals.totalFils, 52500);
    assert.equal(totals.freeDeliveryRemainingFils, 0);
  });
});

describe('checkoutRequest (BUG-02)', () => {
  it('sends the total the cart shows, so the API can refuse a different one', () => {
    const request = checkoutRequest([line()], { addressId: 'address-1', notes: 'Gate 4' });
    assert.deepEqual(request, {
      items: [{ productId: '11111111-1111-4111-8111-111111111111', quantity: 2 }],
      addressId: 'address-1',
      paymentMethod: 'CASH_ON_DELIVERY',
      notes: 'Gate 4',
      expectedTotal: '108.15',
    });
  });

  it('sends no price for any line and leaves out empty notes', () => {
    const request = checkoutRequest([line(), line({ productId: 'other', quantity: 1 })], { addressId: 'address-1' });
    assert.equal('notes' in request, false);
    for (const item of request.items) assert.deepEqual(Object.keys(item).sort(), ['productId', 'quantity']);
    assert.equal(request.expectedTotal, '149.10');
  });
});

describe('withCataloguePrices', () => {
  it('replaces a cached price that changed in the catalogue', () => {
    const cached = line();
    const result = withCataloguePrices([cached], new Map([[cached.productId, product(cached, { unitPrice: '30.00', retailPrice: '31.50' })]]));
    assert.equal(result.changed, true);
    assert.deepEqual(result.unchecked, []);
    assert.equal(result.lines[0]?.unitPrice, '30.00');
    assert.equal(result.lines[0]?.retailPrice, '31.50');
    assert.equal(result.lines[0]?.quantity, 2);
    // The request built from the refreshed cart carries the new total: 60.00 + 25.00 + 4.25 VAT.
    assert.equal(checkoutRequest(result.lines, { addressId: 'a' }).expectedTotal, '89.25');
  });

  it('keeps a line whose product could not be loaded and reports it as unchecked', () => {
    const cached = line({ unitPrice: '0.01', retailPrice: '0.01' });
    const result = withCataloguePrices([cached], new Map([[cached.productId, null]]));
    assert.equal(result.changed, false);
    assert.deepEqual(result.unchecked, [cached.productId]);
    assert.equal(result.lines[0], cached);
  });

  it('returns the same lines when nothing changed', () => {
    const lines = [line()];
    const result = withCataloguePrices(lines, new Map([[lines[0]!.productId, product(lines[0]!)]]));
    assert.equal(result.changed, false);
    assert.equal(result.lines, lines);
  });

  it('raises the quantity to a higher minimum order', () => {
    const cached = line({ quantity: 2 });
    const result = withCataloguePrices([cached], new Map([[cached.productId, product(cached, { minOrderQty: 5 })]]));
    assert.equal(result.lines[0]?.minOrderQty, 5);
    assert.equal(result.lines[0]?.quantity, 5);
  });
});
