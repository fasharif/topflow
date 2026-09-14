/**
 * Response shapes returned by the REST API. Decimal amounts are strings ("1234.50") so no
 * precision is lost in JSON; timestamps are ISO-8601 strings.
 */
import type {
  Emirate,
  OrderChannel,
  OrderStatus,
  OrgRole,
  OrgStatus,
  OrgType,
  PaymentMethod,
  PaymentStatus,
  PaymentTerms,
  QuotationStatus,
  RfqSource,
  RfqStatus,
  Role,
  StockStatus,
  UnitOfMeasure,
} from './enums';
import type { Permission } from './permissions';

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string;
  details?: Array<{ path: string; message: string }>;
  requestId?: string;
}

export interface UserRef {
  id: string;
  fullName: string;
  email?: string;
}

export interface OrganizationRef {
  id: string;
  name: string;
}

// ─── Identity ─────────────────────────────────────────────────────────────

export interface MembershipSummary {
  organizationId: string;
  organizationName: string;
  organizationStatus: OrgStatus;
  role: OrgRole;
  approvalLimit: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  phoneNumber: string | null;
  role: Role;
  emailVerified: boolean;
  permissions: Permission[];
  memberships: MembershipSummary[];
}

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  accessTokenExpiresAt: string;
  /** Only returned to native clients; browsers receive an httpOnly cookie instead. */
  refreshToken?: string;
}

export interface UserAdminDto {
  id: string;
  email: string;
  fullName: string;
  phoneNumber: string | null;
  role: Role;
  isActive: boolean;
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  organizations: Array<OrganizationRef & { role: OrgRole }>;
}

export interface AddressDto {
  id: string;
  label: string;
  contactName: string;
  phoneNumber: string;
  line1: string;
  line2: string | null;
  area: string;
  city: string;
  emirate: Emirate;
  country: string;
  isDefault: boolean;
}

export type AddressSnapshot = Omit<AddressDto, 'id' | 'isDefault'>;

// ─── Organizations ────────────────────────────────────────────────────────

export interface OrganizationDto {
  id: string;
  name: string;
  legalName: string | null;
  type: OrgType;
  status: OrgStatus;
  tradeLicenseNumber: string | null;
  trn: string | null;
  email: string | null;
  phoneNumber: string | null;
  paymentTerms: PaymentTerms;
  creditLimit: string;
  discountRate: string;
  verifiedAt: string | null;
  createdAt: string;
  memberCount?: number;
}

export interface MemberDto {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  role: OrgRole;
  approvalLimit: string | null;
  createdAt: string;
}

export interface InvitationDto {
  id: string;
  email: string;
  role: OrgRole;
  expiresAt: string;
  createdAt: string;
  invitedBy: string | null;
}

export interface InvitationPreviewDto {
  organizationName: string;
  email: string;
  role: OrgRole;
  expiresAt: string;
  hasAccount: boolean;
}

// ─── Catalog ──────────────────────────────────────────────────────────────

export interface CategoryDto {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  displayOrder: number;
  parentId: number | null;
  productCount?: number;
}

/** Indicative price range for one unit of a product (AED amounts as strings). */
export interface PriceRangeDto {
  /** Lowest and highest net prices, excl. VAT. */
  min: string;
  max: string;
  /** The same range including 5% VAT, for consumer display. */
  retailMin: string;
  retailMax: string;
}

export interface ProductDto {
  id: string;
  sku: string;
  slug: string;
  name: string;
  brand: string | null;
  description: string | null;
  specifications: Record<string, string | number | boolean> | null;
  /** Net list price (excl. VAT). */
  unitPrice: string;
  /** VAT-inclusive list price for consumer display. */
  retailPrice: string;
  /** Net price after the caller's organization discount, when acting in a B2B context. */
  tradePrice: string | null;
  /** Indicative market range; a quotation can land anywhere in it. */
  priceRange: PriceRangeDto | null;
  uom: UnitOfMeasure;
  minOrderQty: number;
  stockStatus: StockStatus;
  stockQuantity: number;
  lowStockThreshold: number;
  imageUrl: string | null;
  tags: string[];
  isActive: boolean;
  isTradeOnly: boolean;
  category: { id: number; name: string; slug: string } | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Procurement ──────────────────────────────────────────────────────────

export interface DocumentLineDto {
  id: string;
  productId: string | null;
  sku: string;
  productName: string;
  uom: UnitOfMeasure;
  quantity: number;
  listPrice: string | null;
  discountRate: string;
  unitPrice: string;
  lineSubtotal: string;
  vatAmount: string;
  lineTotal: string;
}

export interface RfqItemDto {
  id: string;
  productId: string | null;
  sku: string;
  productName: string;
  quantity: number;
  notes: string | null;
}

export interface QuotationSummaryDto {
  id: string;
  number: string;
  revision: number;
  displayNumber: string;
  status: QuotationStatus;
  total: string;
  validUntil: string;
  isExpired: boolean;
  organization: OrganizationRef | null;
  customer: UserRef | null;
  createdAt: string;
}

/** Who to reply to for a request submitted on the public website. */
export interface RfqContactDto {
  name: string;
  email: string;
  phone: string | null;
  companyName: string | null;
}

export interface RfqDto {
  id: string;
  number: string;
  status: RfqStatus;
  source: RfqSource;
  /** Present for website requests, which have no account or organization. */
  contact: RfqContactDto | null;
  organization: OrganizationRef | null;
  requestedBy: UserRef | null;
  assignedTo: UserRef | null;
  projectReference: string | null;
  shippingAddress: string | null;
  deliveryAddress: AddressSnapshot | null;
  requiredBy: string | null;
  notes: string | null;
  items: RfqItemDto[];
  quotations: QuotationSummaryDto[];
  createdAt: string;
  updatedAt: string;
}

/** Returned to a website visitor after they submit a quote request. */
export interface WebsiteQuoteReceiptDto {
  number: string;
  lineCount: number;
  createdAt: string;
}

export interface QuotationDto extends QuotationSummaryDto {
  quoteRequest: { id: string; number: string } | null;
  organization: (OrganizationRef & { trn: string | null }) | null;
  createdBy: UserRef | null;
  currency: string;
  vatRateBps: number;
  subtotal: string;
  discountTotal: string;
  deliveryFee: string;
  vatAmount: string;
  terms: string | null;
  notes: string | null;
  /** Staff only. */
  internalNotes?: string | null;
  sentAt: string | null;
  respondedAt: string | null;
  respondedBy: UserRef | null;
  responseNote: string | null;
  purchaseOrderNumber: string | null;
  approvedBy: UserRef | null;
  approvedAt: string | null;
  items: DocumentLineDto[];
  orderId: string | null;
  orderNumber: string | null;
  updatedAt: string;
}

// ─── Orders ───────────────────────────────────────────────────────────────

export interface OrderEventDto {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  note: string | null;
  actor: UserRef | null;
  createdAt: string;
}

export interface OrderSummaryDto {
  id: string;
  orderNumber: string;
  channel: OrderChannel;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  totalAmount: string;
  itemCount: number;
  customer: UserRef | null;
  organization: OrganizationRef | null;
  createdAt: string;
}

export interface OrderDto extends OrderSummaryDto {
  quotation: { id: string; number: string; revision: number } | null;
  currency: string;
  vatRateBps: number;
  subtotal: string;
  discountTotal: string;
  deliveryFee: string;
  vatAmount: string;
  paymentMethod: PaymentMethod | null;
  paymentReference: string | null;
  paidAt: string | null;
  purchaseOrderNumber: string | null;
  projectReference: string | null;
  shippingAddress: string;
  deliveryAddress: AddressSnapshot | null;
  notes: string | null;
  trackingReference: string | null;
  confirmedAt: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  items: DocumentLineDto[];
  events: OrderEventDto[];
  /** Transitions the caller is allowed to perform right now. */
  allowedTransitions: OrderStatus[];
  canCancel: boolean;
  updatedAt: string;
}

// ─── Platform ─────────────────────────────────────────────────────────────

export interface AuditLogDto {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: unknown;
  ipAddress: string | null;
  organizationId: string | null;
  user: UserRef | null;
  createdAt: string;
}

export interface LowStockProductDto {
  id: string;
  sku: string;
  name: string;
  stockQuantity: number;
  lowStockThreshold: number;
}

export interface DashboardStatsDto {
  ordersByStatus: Record<OrderStatus, number>;
  rfqsByStatus: Record<RfqStatus, number>;
  quotationsAwaitingResponse: number;
  quotationsPendingApproval: number;
  pendingOrganizations: number;
  revenueLast30Days: string;
  ordersLast30Days: number;
  lowStockProducts: LowStockProductDto[];
  recentOrders: OrderSummaryDto[];
}

export interface HealthDto {
  status: 'ok' | 'degraded';
  version: string;
  uptimeSeconds: number;
  database?: 'up' | 'down';
}
