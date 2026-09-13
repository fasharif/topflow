import { OrgRole } from '../enums';
import type { Fils } from '../money';

export interface ApprovalContext {
  orgRole: OrgRole;
  /** The member's spending limit in fils (net). `null` means no personal limit is set. */
  approvalLimitFils: Fils | null;
}

/**
 * Segregation of duties for B2B purchasing: decides whether committing `amountFils`
 * (net of VAT) needs sign-off from an organization APPROVER or OWNER.
 *
 *  • A member with a limit needs approval when the amount exceeds it.
 *  • An OWNER or APPROVER without a limit never needs approval.
 *  • A BUYER without a limit always needs approval.
 */
export function requiresApproval(ctx: ApprovalContext, amountFils: Fils): boolean {
  if (ctx.approvalLimitFils !== null) {
    return amountFils > ctx.approvalLimitFils;
  }
  return ctx.orgRole === OrgRole.BUYER;
}

/** Only these roles may approve a colleague's purchase. */
export function canApprovePurchases(role: OrgRole): boolean {
  return role === OrgRole.OWNER || role === OrgRole.APPROVER;
}
