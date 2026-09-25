import { OrgRole } from '../enums';
import { toFils } from '../money';
import { canApprovePurchases, requiresApproval } from './approval';

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
