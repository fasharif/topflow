/** Stable identifiers for the audit trail (grouped by bounded context). */
export const AuditAction = {
  USER_REGISTERED: 'auth.user_registered',
  ORGANIZATION_REGISTERED: 'auth.organization_registered',
  LOGIN: 'auth.login',
  LOGIN_FAILED: 'auth.login_failed',
  LOGOUT_ALL: 'auth.logout_all',
  EMAIL_VERIFIED: 'auth.email_verified',
  PASSWORD_RESET_REQUESTED: 'auth.password_reset_requested',
  PASSWORD_RESET: 'auth.password_reset',
  PASSWORD_CHANGED: 'auth.password_changed',

  USER_UPDATED: 'users.updated',
  STAFF_CREATED: 'users.staff_created',

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
