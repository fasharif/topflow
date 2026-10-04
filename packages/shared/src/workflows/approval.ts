import { OrgRole } from '../enums';
import { toFils, type Fils } from '../money';

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

/** A money amount as the API stores it (a decimal value) or sends it (a decimal string such as "4990.00"). */
type MoneyAmount = Parameters<typeof toFils>[0];

/**
 * The amount a purchase counts for against spending limits, in fils: goods after discount plus
 * delivery, excluding VAT. `requiresApproval` is called with it.
 *
 * The API decides with this amount whether an acceptance needs approval, and the trade portal uses
 * the same function to offer "Accept quotation" or "Send for approval", so the two cannot differ.
 */
export function netPurchaseFils(document: { subtotal: MoneyAmount; deliveryFee: MoneyAmount }): Fils {
  return toFils(document.subtotal) + toFils(document.deliveryFee);
}

/** Only these roles may approve a colleague's purchase. */
export function canApprovePurchases(role: OrgRole): boolean {
  return role === OrgRole.OWNER || role === OrgRole.APPROVER;
}
