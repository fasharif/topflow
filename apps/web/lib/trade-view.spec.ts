import { OrgStatus } from '@topflow/shared';
import { isTradeView } from './trade-view';

/*
 * When the catalogue may show trade prices and the "Showing trade prices" notice. The product lists
 * stand for the answers of GET /catalog/products: `tradePrice` is set for a verified organisation's
 * member and null for everyone else.
 */

const active = { organizationStatus: OrgStatus.ACTIVE };
const pending = { organizationStatus: OrgStatus.PENDING_VERIFICATION };

const tradeData = [{ tradePrice: '35.10' }, { tradePrice: '112.00' }];
const publicData = [{ tradePrice: null }, { tradePrice: null }];

describe('isTradeView', () => {
  it('is the trade view when a verified organisation gets trade prices', () => {
    expect(isTradeView(active, tradeData)).toBe(true);
  });

  it('is not the trade view while the re-fetch has no data: still loading, or the API is down', () => {
    expect(isTradeView(active, undefined)).toBe(false);
    expect(isTradeView(pending, undefined)).toBe(false);
  });

  it('is not the trade view when the session has expired and the API answers with public data', () => {
    expect(isTradeView(active, publicData)).toBe(false);
  });

  it('is not the trade view when only some products carry a trade price, or the page is empty', () => {
    expect(isTradeView(active, [{ tradePrice: '35.10' }, { tradePrice: null }])).toBe(false);
    expect(isTradeView(active, [])).toBe(false);
  });

  it("is an unverified organisation's view when the data has list prices only", () => {
    expect(isTradeView(pending, publicData)).toBe(true);
    expect(isTradeView(pending, [])).toBe(true);
  });

  it("is not an unverified organisation's view when the data carries another organisation's trade prices", () => {
    expect(isTradeView(pending, tradeData)).toBe(false);
  });

  it('is never the trade view without a membership', () => {
    expect(isTradeView(null, tradeData)).toBe(false);
    expect(isTradeView(null, publicData)).toBe(false);
  });
});
