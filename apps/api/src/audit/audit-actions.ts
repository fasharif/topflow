/** Stable identifiers for the audit trail (grouped by bounded context). */
export const AuditAction = {
  // Credential events (failed sign-ins, password changes, MFA) are recorded by Supabase Auth.
  USER_REGISTERED: 'auth.user_registered',
  ORGANIZATION_REGISTERED: 'auth.organization_registered',
  /** A new Supabase session was first used against the API. */
  LOGIN: 'auth.login',

  USER_UPDATED: 'users.updated',
  STAFF_CREATED: 'users.staff_created',
  /** Sales created an account for a website contact so a quotation can be addressed to them. */
  CUSTOMER_INVITED: 'users.customer_invited',

  ORGANIZATION_UPDATED: 'organizations.updated',
  ORGANIZATION_REVIEWED: 'organizations.reviewed',
  MEMBER_INVITED: 'organizations.member_invited',
  INVITATION_ACCEPTED: 'organizations.invitation_accepted',
  INVITATION_REVOKED: 'organizations.invitation_revoked',
  MEMBER_UPDATED: 'organizations.member_updated',
  MEMBER_REMOVED: 'organizations.member_removed',

  PRODUCT_CREATED: 'catalog.product_created',
  PRODUCT_UPDATED: 'catalog.product_updated',
  PRODUCT_ARCHIVED: 'catalog.product_archived',
  STOCK_ADJUSTED: 'catalog.stock_adjusted',
  CATEGORY_CHANGED: 'catalog.category_changed',

  RFQ_SUBMITTED: 'procurement.rfq_submitted',
  RFQ_UPDATED: 'procurement.rfq_updated',
  RFQ_CUSTOMER_ASSIGNED: 'procurement.rfq_customer_assigned',
  QUOTATION_CREATED: 'procurement.quotation_created',
  QUOTATION_UPDATED: 'procurement.quotation_updated',
  QUOTATION_SENT: 'procurement.quotation_sent',
  QUOTATION_REVISED: 'procurement.quotation_revised',
  QUOTATION_RESPONDED: 'procurement.quotation_responded',
  QUOTATION_APPROVAL_DECIDED: 'procurement.quotation_approval_decided',

  ORDER_PLACED: 'orders.placed',
  ORDER_STATUS_CHANGED: 'orders.status_changed',
  ORDER_CANCELLED: 'orders.cancelled',
  ORDER_PAYMENT_RECORDED: 'orders.payment_recorded',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];
