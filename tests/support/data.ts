import type { OrderSummaryDto, OrganizationDto, Paginated, ProductDto, QuotationSummaryDto } from '@topflow/shared';
import type { BffClient } from './bff';

/**
 * Documents created by the demo seed with fixed numbers (packages/database/prisma/seed.ts), so
 * tests can open them without creating anything.
 */
export const SEEDED = {
  /** Desert Bloom quotation awaiting the buyer's decision. */
  openQuotation: 'TF-QT-2026-D00001',
  /** Sara Ahmed's delivered retail order. */
  deliveredRetailOrder: 'TF-SO-2026-D00002',
  /** Desert Bloom sales order being picked. */
  tradeOrderInProgress: 'TF-SO-2026-D00001',
} as const;

/** Retail products the journeys buy and quote (priced, in stock, not trade-only). */
export const PRODUCTS = {
  fitting: 'AX-EFS-002',
  pipeFitting: 'AX-EFS-005',
  bubbler: 'WS-1702',
} as const;

export async function productBySku(api: BffClient, sku: string): Promise<ProductDto> {
  const page = await api.get<Paginated<ProductDto>>('/catalog/products', { query: { search: sku, pageSize: 20 } });
  const product = page.items.find((item) => item.sku === sku);
  if (!product) throw new Error(`Product ${sku} is not in the catalogue. Is the demo data seeded?`);
  return product;
}

function single<T extends { id: string }>(page: Paginated<T>, what: string): T {
  const [first] = page.items;
  if (!first || page.items.length !== 1) throw new Error(`Expected exactly one ${what}, found ${page.items.length}. Is the demo data seeded?`);
  return first;
}

export async function customerOrderId(api: BffClient, orderNumber: string): Promise<string> {
  return single(await api.get<Paginated<OrderSummaryDto>>('/me/orders', { query: { search: orderNumber } }), `order ${orderNumber}`).id;
}

export async function staffOrderId(api: BffClient, orderNumber: string): Promise<string> {
  return single(await api.get<Paginated<OrderSummaryDto>>('/admin/orders', { query: { search: orderNumber } }), `order ${orderNumber}`).id;
}

export async function organizationQuotationId(api: BffClient, organizationId: string, number: string): Promise<string> {
  const page = await api.get<Paginated<QuotationSummaryDto>>('/org/quotations', { organizationId, query: { search: number } });
  return single(page, `quotation ${number}`).id;
}

export async function organizationByName(api: BffClient, name: string): Promise<OrganizationDto> {
  const page = await api.get<Paginated<OrganizationDto>>('/admin/organizations', { query: { search: name } });
  const found = page.items.find((organization) => organization.name === name);
  if (!found) throw new Error(`Organization "${name}" not found. Is the demo data seeded?`);
  return found;
}
