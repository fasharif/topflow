import type { OrderSummaryDto, OrganizationDto, Paginated, ProductDto, QuotationSummaryDto, RfqDto } from '@topflow/shared';
import type { BffClient } from './bff';

/**
 * Documents created by the demo seed with fixed numbers (packages/database/prisma/seed.ts), so
 * tests can open them without creating anything.
 */
export const SEEDED = {
  /** Desert Bloom quotation awaiting the buyer's decision. */
  openQuotation: 'TF-QT-2026-D00001',
  /** Desert Bloom quotation the buyer accepted above their limit, waiting for an approver. */
  pendingApprovalQuotation: 'TF-QT-2026-D00002',
  /** Sara Ahmed's delivered retail order. */
  deliveredRetailOrder: 'TF-SO-2026-D00002',
  /** Sara Ahmed's confirmed retail order, not yet picked. */
  confirmedRetailOrder: 'TF-SO-2026-D00003',
  /** Desert Bloom RFQ waiting for the sales team. */
  submittedRfq: 'TF-RFQ-2026-D00001',
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

export async function organizationOrderId(api: BffClient, organizationId: string, orderNumber: string): Promise<string> {
  return single(await api.get<Paginated<OrderSummaryDto>>('/org/orders', { organizationId, query: { search: orderNumber } }), `order ${orderNumber}`)
    .id;
}

export async function organizationRfqId(api: BffClient, organizationId: string, number: string): Promise<string> {
  return single(await api.get<Paginated<RfqDto>>('/org/rfqs', { organizationId, query: { search: number } }), `RFQ ${number}`).id;
}

export async function staffRfqId(api: BffClient, number: string): Promise<string> {
  return single(await api.get<Paginated<RfqDto>>('/admin/rfqs', { query: { search: number } }), `RFQ ${number}`).id;
}

export async function staffQuotationId(api: BffClient, number: string): Promise<string> {
  return single(await api.get<Paginated<QuotationSummaryDto>>('/admin/quotations', { query: { search: number } }), `quotation ${number}`).id;
}

export async function organizationByName(api: BffClient, name: string): Promise<OrganizationDto> {
  const page = await api.get<Paginated<OrganizationDto>>('/admin/organizations', { query: { search: name } });
  const found = page.items.find((organization) => organization.name === name);
  if (!found) throw new Error(`Organization "${name}" not found. Is the demo data seeded?`);
  return found;
}
