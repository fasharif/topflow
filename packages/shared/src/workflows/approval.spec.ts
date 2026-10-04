import { OrgRole } from '../enums';
import { toFils } from '../money';
import { canApprovePurchases, netPurchaseFils, requiresApproval } from './approval';

// Decision table and boundary values for purchase approval (docs/testing/TEST-PLAN.md, table A).
// Amounts are net of VAT and include delivery, in fils: AED 5,000.00 = 500,000 fils.

const BUYER_LIMIT = toFils('5000.00');
const APPROVER_LIMIT = toFils('50000.00');

describe('requiresApproval — decision table A', () => {
  it.each`
    rule    | role                | limit             | amount                | approval | case
    ${'A1'} | ${OrgRole.BUYER}    | ${BUYER_LIMIT}    | ${BUYER_LIMIT - 1}    | ${false} | ${'one fils below the limit'}
    ${'A2'} | ${OrgRole.BUYER}    | ${BUYER_LIMIT}    | ${BUYER_LIMIT}        | ${false} | ${'exactly at the limit'}
    ${'A3'} | ${OrgRole.BUYER}    | ${BUYER_LIMIT}    | ${BUYER_LIMIT + 1}    | ${true}  | ${'one fils above the limit'}
    ${'A4'} | ${OrgRole.BUYER}    | ${null}           | ${1}                  | ${true}  | ${'buyer without a limit, smallest amount'}
    ${'A4'} | ${OrgRole.BUYER}    | ${null}           | ${0}                  | ${true}  | ${'buyer without a limit, nothing to pay'}
    ${'A1'} | ${OrgRole.APPROVER} | ${APPROVER_LIMIT} | ${APPROVER_LIMIT - 1} | ${false} | ${'approver one fils below their limit'}
    ${'A2'} | ${OrgRole.APPROVER} | ${APPROVER_LIMIT} | ${APPROVER_LIMIT}     | ${false} | ${'approver exactly at their limit'}
    ${'A3'} | ${OrgRole.APPROVER} | ${APPROVER_LIMIT} | ${APPROVER_LIMIT + 1} | ${true}  | ${'approver one fils above their limit'}
    ${'A5'} | ${OrgRole.APPROVER} | ${null}           | ${10_000_000_000}     | ${false} | ${'approver without a limit'}
    ${'A3'} | ${OrgRole.OWNER}    | ${BUYER_LIMIT}    | ${BUYER_LIMIT + 1}    | ${true}  | ${'owner with a limit, above it'}
    ${'A5'} | ${OrgRole.OWNER}    | ${null}           | ${10_000_000_000}     | ${false} | ${'owner without a limit'}
    ${'A2'} | ${OrgRole.BUYER}    | ${0}              | ${0}                  | ${false} | ${'zero limit, nothing to pay'}
    ${'A3'} | ${OrgRole.BUYER}    | ${0}              | ${1}                  | ${true}  | ${'zero limit, one fils'}
  `('$rule: $case → approval $approval', ({ role, limit, amount, approval }: { role: OrgRole; limit: number | null; amount: number; approval: boolean }) => {
    expect(requiresApproval({ orgRole: role, approvalLimitFils: limit }, amount)).toBe(approval);
  });
});

describe('netPurchaseFils — the amount that counts against a spending limit', () => {
  it('adds delivery to the goods after discount and leaves VAT out', () => {
    // A quotation as the API returns it: AED 4,990.00 of goods, AED 10.00 delivery, 5% VAT on both.
    const quotation = { subtotal: '4990.00', deliveryFee: '10.00', vatAmount: '250.00', total: '5250.00' };

    expect(netPurchaseFils(quotation)).toBe(toFils('5000.00'));
  });

  it('counts only the goods when delivery is free', () => {
    expect(netPurchaseFils({ subtotal: '1234.56', deliveryFee: '0.00' })).toBe(123_456);
  });

  it('accepts the decimal values the API reads from the database', () => {
    const decimal = (text: string) => ({ toString: () => text });

    expect(netPurchaseFils({ subtotal: decimal('4990'), deliveryFee: decimal('10.5') })).toBe(500_050);
  });

  it('adds in whole fils, without floating-point error', () => {
    expect(netPurchaseFils({ subtotal: '0.10', deliveryFee: '0.20' })).toBe(30);
  });

  it.each`
    subtotal     | deliveryFee | approval | case
    ${'4990.00'} | ${'10.00'}  | ${false} | ${'delivery brings the purchase exactly to the limit'}
    ${'4990.00'} | ${'10.01'}  | ${true}  | ${'delivery takes the purchase one fils over the limit'}
    ${'5000.00'} | ${'0.00'}   | ${false} | ${'goods exactly at the limit, free delivery'}
  `('with a AED 5,000 limit, $case → approval $approval', ({ subtotal, deliveryFee, approval }: { subtotal: string; deliveryFee: string; approval: boolean }) => {
    const amount = netPurchaseFils({ subtotal, deliveryFee });

    expect(requiresApproval({ orgRole: OrgRole.BUYER, approvalLimitFils: BUYER_LIMIT }, amount)).toBe(approval);
  });
});

describe('canApprovePurchases — who may sign off', () => {
  it.each`
    role                | allowed
    ${OrgRole.OWNER}    | ${true}
    ${OrgRole.APPROVER} | ${true}
    ${OrgRole.BUYER}    | ${false}
  `('$role → $allowed', ({ role, allowed }: { role: OrgRole; allowed: boolean }) => {
    expect(canApprovePurchases(role)).toBe(allowed);
  });
});
