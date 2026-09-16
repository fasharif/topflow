/**
 * Domain enums shared by every client. They mirror the Prisma schema exactly —
 * apps/api/src/common/enum-parity.ts fails compilation if the two drift apart.
 * Declared as `const` objects (not TS `enum`s) so they are erasable, tree-shakeable
 * and usable in React Native without the Prisma runtime.
 */
type ValueOf<T> = T[keyof T];

export const Role = {
  CUSTOMER: 'CUSTOMER',
  SALES: 'SALES',
  WAREHOUSE: 'WAREHOUSE',
  ADMIN: 'ADMIN',
} as const;
export type Role = ValueOf<typeof Role>;

export const OrgRole = {
  OWNER: 'OWNER',
  APPROVER: 'APPROVER',
  BUYER: 'BUYER',
} as const;
export type OrgRole = ValueOf<typeof OrgRole>;

export const OrgStatus = {
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
} as const;
export type OrgStatus = ValueOf<typeof OrgStatus>;

export const OrgType = {
  CONTRACTOR: 'CONTRACTOR',
  LANDSCAPING: 'LANDSCAPING',
  FACILITY_MANAGEMENT: 'FACILITY_MANAGEMENT',
  DEVELOPER: 'DEVELOPER',
  GOVERNMENT: 'GOVERNMENT',
  RESELLER: 'RESELLER',
  OTHER: 'OTHER',
} as const;
export type OrgType = ValueOf<typeof OrgType>;

export const PaymentTerms = {
  PREPAID: 'PREPAID',
  NET_15: 'NET_15',
  NET_30: 'NET_30',
  NET_60: 'NET_60',
} as const;
export type PaymentTerms = ValueOf<typeof PaymentTerms>;

export const Emirate = {
  ABU_DHABI: 'ABU_DHABI',
  DUBAI: 'DUBAI',
  SHARJAH: 'SHARJAH',
  AJMAN: 'AJMAN',
  UMM_AL_QUWAIN: 'UMM_AL_QUWAIN',
  RAS_AL_KHAIMAH: 'RAS_AL_KHAIMAH',
  FUJAIRAH: 'FUJAIRAH',
} as const;
export type Emirate = ValueOf<typeof Emirate>;

export const StockStatus = {
  IN_STOCK: 'IN_STOCK',
  ON_ORDER: 'ON_ORDER',
} as const;
export type StockStatus = ValueOf<typeof StockStatus>;

export const UnitOfMeasure = {
  PIECE: 'PIECE',
  METER: 'METER',
  ROLL: 'ROLL',
  BOX: 'BOX',
  SET: 'SET',
} as const;
export type UnitOfMeasure = ValueOf<typeof UnitOfMeasure>;

export const RfqStatus = {
  SUBMITTED: 'SUBMITTED',
  IN_REVIEW: 'IN_REVIEW',
  QUOTED: 'QUOTED',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
} as const;
export type RfqStatus = ValueOf<typeof RfqStatus>;

/** Where a request for quotation came from. */
export const RfqSource = {
  TRADE_PORTAL: 'TRADE_PORTAL',
  WEBSITE: 'WEBSITE',
} as const;
export type RfqSource = ValueOf<typeof RfqSource>;

/** How a website visitor prefers to be contacted about their quote request. */
export const ContactChannel = {
  PHONE: 'PHONE',
  WHATSAPP: 'WHATSAPP',
  EMAIL: 'EMAIL',
} as const;
export type ContactChannel = ValueOf<typeof ContactChannel>;

export const QuotationStatus = {
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  REVISION_REQUESTED: 'REVISION_REQUESTED',
  EXPIRED: 'EXPIRED',
  SUPERSEDED: 'SUPERSEDED',
} as const;
export type QuotationStatus = ValueOf<typeof QuotationStatus>;

export const OrderChannel = {
  RETAIL: 'RETAIL',
  B2B: 'B2B',
} as const;
export type OrderChannel = ValueOf<typeof OrderChannel>;

export const OrderStatus = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  CONFIRMED: 'CONFIRMED',
  PROCESSING: 'PROCESSING',
  DISPATCHED: 'DISPATCHED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
} as const;
export type OrderStatus = ValueOf<typeof OrderStatus>;

export const PaymentMethod = {
  CASH_ON_DELIVERY: 'CASH_ON_DELIVERY',
  CARD: 'CARD',
  BANK_TRANSFER: 'BANK_TRANSFER',
  CREDIT_ACCOUNT: 'CREDIT_ACCOUNT',
} as const;
export type PaymentMethod = ValueOf<typeof PaymentMethod>;

export const PaymentStatus = {
  UNPAID: 'UNPAID',
  PAID: 'PAID',
  REFUNDED: 'REFUNDED',
} as const;
export type PaymentStatus = ValueOf<typeof PaymentStatus>;

// ─── Human-readable labels for UIs and PDFs ───────────────────────────────

export const ROLE_LABELS: Record<Role, string> = {
  CUSTOMER: 'Customer',
  SALES: 'Sales',
  WAREHOUSE: 'Warehouse',
  ADMIN: 'Administrator',
};

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  OWNER: 'Owner',
  APPROVER: 'Approver',
  BUYER: 'Buyer',
};

export const ORG_STATUS_LABELS: Record<OrgStatus, string> = {
  PENDING_VERIFICATION: 'Pending verification',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
};

export const ORG_TYPE_LABELS: Record<OrgType, string> = {
  CONTRACTOR: 'Contractor',
  LANDSCAPING: 'Landscaping company',
  FACILITY_MANAGEMENT: 'Facility management',
  DEVELOPER: 'Property developer',
  GOVERNMENT: 'Government entity',
  RESELLER: 'Reseller',
  OTHER: 'Other',
};

export const PAYMENT_TERMS_LABELS: Record<PaymentTerms, string> = {
  PREPAID: 'Prepaid',
  NET_15: 'Net 15 days',
  NET_30: 'Net 30 days',
  NET_60: 'Net 60 days',
};

export const EMIRATE_LABELS: Record<Emirate, string> = {
  ABU_DHABI: 'Abu Dhabi',
  DUBAI: 'Dubai',
  SHARJAH: 'Sharjah',
  AJMAN: 'Ajman',
  UMM_AL_QUWAIN: 'Umm Al Quwain',
  RAS_AL_KHAIMAH: 'Ras Al Khaimah',
  FUJAIRAH: 'Fujairah',
};

export const UOM_LABELS: Record<UnitOfMeasure, string> = {
  PIECE: 'pc',
  METER: 'm',
  ROLL: 'roll',
  BOX: 'box',
  SET: 'set',
};

export const RFQ_STATUS_LABELS: Record<RfqStatus, string> = {
  SUBMITTED: 'Submitted',
  IN_REVIEW: 'In review',
  QUOTED: 'Quoted',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};

export const RFQ_SOURCE_LABELS: Record<RfqSource, string> = {
  TRADE_PORTAL: 'Trade portal',
  WEBSITE: 'Website',
};

export const CONTACT_CHANNEL_LABELS: Record<ContactChannel, string> = {
  PHONE: 'Phone call',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Email',
};

export const QUOTATION_STATUS_LABELS: Record<QuotationStatus, string> = {
  DRAFT: 'Draft',
  SENT: 'Awaiting response',
  PENDING_APPROVAL: 'Pending internal approval',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  REVISION_REQUESTED: 'Revision requested',
  EXPIRED: 'Expired',
  SUPERSEDED: 'Superseded',
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Pending payment',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Processing',
  DISPATCHED: 'Dispatched',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH_ON_DELIVERY: 'Cash / card on delivery',
  CARD: 'Online card payment',
  BANK_TRANSFER: 'Bank transfer',
  CREDIT_ACCOUNT: 'Credit account',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  UNPAID: 'Unpaid',
  PAID: 'Paid',
  REFUNDED: 'Refunded',
};

/** Ordered list of values for a const-object enum (stable, declaration order). */
export function enumValues<T extends Record<string, string>>(e: T): [T[keyof T], ...T[keyof T][]] {
  return Object.values(e) as [T[keyof T], ...T[keyof T][]];
}
