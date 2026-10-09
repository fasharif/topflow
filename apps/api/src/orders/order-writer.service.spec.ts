import type { Prisma } from '@topflow/database';
import {
  OrderStatus,
  OrderChannel,
  PaymentMethod,
  PaymentStatus,
  PaymentTerms,
} from '@topflow/shared';
import type { AuditService } from '../audit/audit.service';
import type { NumberingService } from '../common/numbering.service';
import { OrderWriter, type QuotationForOrder } from './order-writer.service';

// Decision table B (docs/testing/TEST-PLAN.md): how an accepted quotation is released as a sales
// order. Credit exposure is the sum of the organization's unpaid, not cancelled orders; the order
// is released on credit while exposure plus its total (VAT included) stays within the limit.

interface Scenario {
  organization: { paymentTerms: PaymentTerms; creditLimit: string } | null;
  organizationId?: string | null;
  /** The row as stored when it is locked, if different from the quotation's copy. */
  lockedTerms?: { paymentTerms: PaymentTerms; creditLimit: string };
  exposure: string | null;
  total: string;
}

function quotation(scenario: Scenario): QuotationForOrder {
  const organizationId =
    scenario.organizationId !== undefined
      ? scenario.organizationId
      : scenario.organization
        ? 'org-1'
        : null;
  return {
    id: 'quotation-1',
    number: 'TF-QT-2026-000001',
    revision: 1,
    organizationId,
    organization: scenario.organization && {
      id: 'org-1',
      ...scenario.organization,
    },
    quoteRequest: null,
    currency: 'AED',
    vatRateBps: 500,
    subtotal: '0.00',
    discountTotal: '0.00',
    deliveryFee: '0.00',
    vatAmount: '0.00',
    total: scenario.total,
    purchaseOrderNumber: null,
    notes: null,
    items: [],
  } as unknown as QuotationForOrder;
}

async function release(scenario: Scenario) {
  const aggregate = jest
    .fn()
    .mockResolvedValue({ _sum: { totalAmount: scenario.exposure } });
  const create = jest.fn(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'order-1', ...data }),
  );
  // SELECT … FOR UPDATE on the organisation: the terms as stored, read under the row lock.
  const lockTerms = jest
    .fn()
    .mockResolvedValue(
      scenario.lockedTerms
        ? [scenario.lockedTerms]
        : scenario.organization
          ? [scenario.organization]
          : [],
    );
  const tx = {
    $queryRaw: lockTerms,
    order: { aggregate, create },
    orderStatusEvent: { create: jest.fn().mockResolvedValue({}) },
  } as unknown as Prisma.TransactionClient;
  const numbering = {
    next: jest.fn().mockResolvedValue('TF-SO-2026-000001'),
  } as unknown as NumberingService;
  const audit = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuditService;

  const result = await new OrderWriter(numbering, audit).createFromQuotation(
    tx,
    quotation(scenario),
    'user-1',
    { requestId: 'decision-table', ipAddress: null, userAgent: null },
  );
  const data = create.mock.calls[0]?.[0].data ?? {};
  return { result, data, aggregate, lockTerms };
}

const NET_30 = (creditLimit: string) => ({
  paymentTerms: PaymentTerms.NET_30,
  creditLimit,
});

describe('OrderWriter.createFromQuotation — decision table B', () => {
  it.each`
    rule    | case                                                     | organization                                                         | exposure     | total        | status                         | method
    ${'B1'} | ${'personal quotation: retail order, paid on delivery'}  | ${null}                                                              | ${null}      | ${'105.00'}  | ${OrderStatus.CONFIRMED}       | ${PaymentMethod.CASH_ON_DELIVERY}
    ${'B2'} | ${'prepaid account waits for payment'}                   | ${{ paymentTerms: PaymentTerms.PREPAID, creditLimit: '1000000.00' }} | ${'0.00'}    | ${'0.21'}    | ${OrderStatus.PENDING_PAYMENT} | ${PaymentMethod.BANK_TRANSFER}
    ${'B3'} | ${'well within the credit limit'}                        | ${NET_30('1050.00')}                                                 | ${'500.00'}  | ${'500.00'}  | ${OrderStatus.CONFIRMED}       | ${PaymentMethod.CREDIT_ACCOUNT}
    ${'B4'} | ${'exposure plus order exactly at the limit'}            | ${NET_30('1050.00')}                                                 | ${'0.00'}    | ${'1050.00'} | ${OrderStatus.CONFIRMED}       | ${PaymentMethod.CREDIT_ACCOUNT}
    ${'B4'} | ${'no earlier orders (sum is null), order at the limit'} | ${NET_30('1050.00')}                                                 | ${null}      | ${'1050.00'} | ${OrderStatus.CONFIRMED}       | ${PaymentMethod.CREDIT_ACCOUNT}
    ${'B5'} | ${'one fils over the limit'}                             | ${NET_30('1050.00')}                                                 | ${'1050.00'} | ${'0.01'}    | ${OrderStatus.PENDING_PAYMENT} | ${PaymentMethod.BANK_TRANSFER}
    ${'B5'} | ${'a single order above the limit'}                      | ${NET_30('1050.00')}                                                 | ${'0.00'}    | ${'1050.01'} | ${OrderStatus.PENDING_PAYMENT} | ${PaymentMethod.BANK_TRANSFER}
    ${'B3'} | ${'Net 15 follows the same rule, one fils below'}        | ${{ paymentTerms: PaymentTerms.NET_15, creditLimit: '100.00' }}      | ${'0.00'}    | ${'99.99'}   | ${OrderStatus.CONFIRMED}       | ${PaymentMethod.CREDIT_ACCOUNT}
    ${'B4'} | ${'Net 15 follows the same rule, at the limit'}          | ${{ paymentTerms: PaymentTerms.NET_15, creditLimit: '100.00' }}      | ${'0.00'}    | ${'100.00'}  | ${OrderStatus.CONFIRMED}       | ${PaymentMethod.CREDIT_ACCOUNT}
    ${'B5'} | ${'Net 60 follows the same rule'}                        | ${{ paymentTerms: PaymentTerms.NET_60, creditLimit: '100.00' }}      | ${'0.00'}    | ${'100.01'}  | ${OrderStatus.PENDING_PAYMENT} | ${PaymentMethod.BANK_TRANSFER}
    ${'B6'} | ${'credit terms with a zero limit'}                      | ${NET_30('0.00')}                                                    | ${'0.00'}    | ${'0.01'}    | ${OrderStatus.PENDING_PAYMENT} | ${PaymentMethod.BANK_TRANSFER}
  `(
    '$rule: $case',
    async ({
      organization,
      exposure,
      total,
      status,
      method,
    }: Scenario & { status: OrderStatus; method: PaymentMethod }) => {
      const { result, data } = await release({ organization, exposure, total });
      expect(result.status).toBe(status);
      expect(data).toMatchObject({
        status,
        paymentMethod: method,
        channel: organization ? OrderChannel.B2B : OrderChannel.RETAIL,
        totalAmount: total,
      });
      expect(data.confirmedAt instanceof Date).toBe(
        status === OrderStatus.CONFIRMED,
      );
    },
  );

  it('B7: an organization that no longer exists is treated like prepaid', async () => {
    const { result, aggregate } = await release({
      organization: null,
      organizationId: 'org-gone',
      exposure: null,
      total: '10.00',
    });
    expect(result.status).toBe(OrderStatus.PENDING_PAYMENT);
    expect(aggregate).not.toHaveBeenCalled();
  });

  it('locks the organization row before summing its exposure', async () => {
    const { aggregate, lockTerms } = await release({
      organization: NET_30('1050.00'),
      exposure: '0.00',
      total: '1.00',
    });
    const [sql, organizationId] = lockTerms.mock.calls[0] as [
      TemplateStringsArray,
      string,
    ];
    expect(sql.join('?')).toMatch(
      /FROM "organizations"\s+WHERE "id" = \?\s+FOR UPDATE/,
    );
    expect(organizationId).toBe('org-1');
    expect(lockTerms.mock.invocationCallOrder[0]).toBeLessThan(
      aggregate.mock.invocationCallOrder[0],
    );
  });

  it('applies the terms as stored when the row is locked, not the quotation’s copy', async () => {
    const lowered = await release({
      organization: NET_30('1050.00'),
      lockedTerms: NET_30('100.00'),
      exposure: '0.00',
      total: '500.00',
    });
    expect(lowered.result.status).toBe(OrderStatus.PENDING_PAYMENT);
    const prepaid = await release({
      organization: NET_30('1050.00'),
      lockedTerms: {
        paymentTerms: PaymentTerms.PREPAID,
        creditLimit: '1050.00',
      },
      exposure: '0.00',
      total: '500.00',
    });
    expect(prepaid.result.status).toBe(OrderStatus.PENDING_PAYMENT);
    expect(prepaid.aggregate).not.toHaveBeenCalled();
  });

  it('counts only unpaid, not cancelled orders of the same organization', async () => {
    const { aggregate } = await release({
      organization: NET_30('1050.00'),
      exposure: '0.00',
      total: '1.00',
    });
    expect(aggregate).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        paymentStatus: PaymentStatus.UNPAID,
        status: { not: OrderStatus.CANCELLED },
      },
      _sum: { totalAmount: true },
    });
  });
});
