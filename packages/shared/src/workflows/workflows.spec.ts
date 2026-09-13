import { OrderStatus, OrgRole, QuotationStatus, RfqStatus } from '../enums';
import { formatDocumentNumber, quotationDisplayNumber } from '../numbering';
import { canApprovePurchases, requiresApproval } from './approval';
import { ORDER_TRANSITIONS, isCustomerCancellable } from './order';
import { QUOTATION_TRANSITIONS, RFQ_TRANSITIONS, isQuotationOpen } from './quotation';
import {
  InvalidTransitionError,
  assertTransition,
  canTransition,
  isTerminal,
} from './state-machine';

describe('order state machine', () => {
  it('follows the fulfilment happy path', () => {
    expect(canTransition(ORDER_TRANSITIONS, OrderStatus.PENDING_PAYMENT, OrderStatus.CONFIRMED)).toBe(true);
    expect(canTransition(ORDER_TRANSITIONS, OrderStatus.CONFIRMED, OrderStatus.PROCESSING)).toBe(true);
    expect(canTransition(ORDER_TRANSITIONS, OrderStatus.PROCESSING, OrderStatus.DISPATCHED)).toBe(true);
    expect(canTransition(ORDER_TRANSITIONS, OrderStatus.DISPATCHED, OrderStatus.DELIVERED)).toBe(true);
  });

  it('forbids skipping steps and cancelling shipped goods', () => {
    expect(canTransition(ORDER_TRANSITIONS, OrderStatus.CONFIRMED, OrderStatus.DELIVERED)).toBe(false);
    expect(canTransition(ORDER_TRANSITIONS, OrderStatus.DISPATCHED, OrderStatus.CANCELLED)).toBe(false);
    expect(() =>
      assertTransition(ORDER_TRANSITIONS, OrderStatus.DELIVERED, OrderStatus.PROCESSING, 'order'),
    ).toThrow(InvalidTransitionError);
  });

  it('treats delivered and cancelled orders as terminal', () => {
    expect(isTerminal(ORDER_TRANSITIONS, OrderStatus.DELIVERED)).toBe(true);
    expect(isTerminal(ORDER_TRANSITIONS, OrderStatus.CANCELLED)).toBe(true);
  });

  it('lets customers cancel only before picking starts', () => {
    expect(isCustomerCancellable(OrderStatus.CONFIRMED)).toBe(true);
    expect(isCustomerCancellable(OrderStatus.PROCESSING)).toBe(false);
  });
});

describe('quotation and RFQ state machines', () => {
  it('allows acceptance only from an open quotation', () => {
    expect(canTransition(QUOTATION_TRANSITIONS, QuotationStatus.SENT, QuotationStatus.ACCEPTED)).toBe(true);
    expect(
      canTransition(QUOTATION_TRANSITIONS, QuotationStatus.PENDING_APPROVAL, QuotationStatus.ACCEPTED),
    ).toBe(true);
    expect(canTransition(QUOTATION_TRANSITIONS, QuotationStatus.DRAFT, QuotationStatus.ACCEPTED)).toBe(false);
    expect(canTransition(QUOTATION_TRANSITIONS, QuotationStatus.ACCEPTED, QuotationStatus.SENT)).toBe(false);
  });

  it('identifies open quotations', () => {
    expect(isQuotationOpen(QuotationStatus.SENT)).toBe(true);
    expect(isQuotationOpen(QuotationStatus.EXPIRED)).toBe(false);
  });

  it('re-opens a quoted RFQ when a revision is requested', () => {
    expect(canTransition(RFQ_TRANSITIONS, RfqStatus.QUOTED, RfqStatus.IN_REVIEW)).toBe(true);
    expect(canTransition(RFQ_TRANSITIONS, RfqStatus.QUOTED, RfqStatus.CANCELLED)).toBe(false);
  });
});

describe('purchase approval rules', () => {
  it('requires approval for buyers without a spending limit', () => {
    expect(requiresApproval({ orgRole: OrgRole.BUYER, approvalLimitFils: null }, 1)).toBe(true);
  });

  it('honours a personal spending limit', () => {
    const buyer = { orgRole: OrgRole.BUYER, approvalLimitFils: 500_000 };
    expect(requiresApproval(buyer, 400_000)).toBe(false);
    expect(requiresApproval(buyer, 600_000)).toBe(true);
    expect(requiresApproval({ orgRole: OrgRole.APPROVER, approvalLimitFils: 100 }, 101)).toBe(true);
  });

  it('never blocks owners or approvers without a limit', () => {
    expect(requiresApproval({ orgRole: OrgRole.OWNER, approvalLimitFils: null }, 10_000_000)).toBe(false);
    expect(canApprovePurchases(OrgRole.APPROVER)).toBe(true);
    expect(canApprovePurchases(OrgRole.BUYER)).toBe(false);
  });
});

describe('document numbering', () => {
  it('pads sequential numbers', () => {
    expect(formatDocumentNumber('TF-SO', 2026, 123)).toBe('TF-SO-2026-000123');
    expect(() => formatDocumentNumber('TF-SO', 2026, 0)).toThrow(RangeError);
  });

  it('labels quotation revisions', () => {
    expect(quotationDisplayNumber('TF-QT-2026-000045', 1)).toBe('TF-QT-2026-000045');
    expect(quotationDisplayNumber('TF-QT-2026-000045', 3)).toBe('TF-QT-2026-000045 Rev.3');
  });
});
