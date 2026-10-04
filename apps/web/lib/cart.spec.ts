import { UnitOfMeasure, type ProductDto } from '@topflow/shared';
import { addToCart, cartLines, clearCart, refreshCartPrices } from './cart';

// The HTTP client pulls in the session and server actions; these tests pass their own loader.
jest.mock('./api', () => ({ api: jest.fn() }));

/*
 * The basket refresh behind BUG-02 (docs/testing/BUGS-FOUND.md): the prices a shopper sees before
 * ordering come from the catalogue, not from what was cached when the item was added or edited in
 * the browser's storage.
 */

function product(overrides: Partial<ProductDto> = {}): ProductDto {
  return {
    id: 'product-1',
    sku: 'AX-EFS-002',
    slug: 'electrofusion-tee-50-mm',
    name: 'Electrofusion Tee (50 mm)',
    uom: UnitOfMeasure.PIECE,
    unitPrice: '39.00',
    retailPrice: '40.95',
    minOrderQty: 1,
    isTradeOnly: false,
    imageUrl: null,
    ...overrides,
  } as ProductDto;
}

const catalogue = (...products: ProductDto[]) => {
  const byId = new Map(products.map((p) => [p.id, p]));
  return jest.fn((id: string) => {
    const found = byId.get(id);
    return found ? Promise.resolve(found) : Promise.reject(new Error(`GET /catalog/products/${id} failed`));
  });
};

beforeEach(() => clearCart());

describe('refreshCartPrices', () => {
  it('replaces a cached price and name with the catalogue’s current ones, keeping the quantity', async () => {
    addToCart(product(), 2);
    const result = await refreshCartPrices(catalogue(product({ unitPrice: '30.00', retailPrice: '31.50', name: 'Electrofusion Tee 50 mm' })));
    expect(result).toEqual({ unchecked: [] });
    expect(cartLines()).toEqual([expect.objectContaining({ productId: 'product-1', quantity: 2, unitPrice: '30.00', retailPrice: '31.50', name: 'Electrofusion Tee 50 mm' })]);
  });

  it('keeps a line whose product cannot be loaded, and reports its price as unchecked', async () => {
    addToCart(product(), 1);
    addToCart(product({ id: 'product-2', sku: 'AX-EFS-005', unitPrice: '98.00' }), 1);
    const result = await refreshCartPrices(catalogue(product({ unitPrice: '35.00' })));
    expect(result).toEqual({ unchecked: ['product-2'] });
    expect(cartLines().map((line) => [line.productId, line.unitPrice])).toEqual([
      ['product-1', '35.00'],
      ['product-2', '98.00'],
    ]);
  });

  it('leaves the basket as it is when nothing changed, and loads each product once', async () => {
    addToCart(product(), 1);
    addToCart(product(), 2);
    const before = cartLines();
    const load = catalogue(product());
    await refreshCartPrices(load);
    expect(cartLines()).toBe(before);
    expect(cartLines()).toEqual([expect.objectContaining({ quantity: 3 })]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does nothing for an empty basket', async () => {
    const load = catalogue();
    expect(await refreshCartPrices(load)).toEqual({ unchecked: [] });
    expect(load).not.toHaveBeenCalled();
  });
});
