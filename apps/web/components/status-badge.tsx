import {
  ORDER_STATUS_LABELS,
  ORG_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  QUOTATION_STATUS_LABELS,
  RFQ_STATUS_LABELS,
  type OrderStatus,
  type OrgStatus,
  type PaymentStatus,
  type QuotationStatus,
  type RfqStatus,
} from '@topflow/shared';
import { Badge, type Tone } from './ui';

const ORDER_TONES: Record<OrderStatus, Tone> = {
  PENDING_PAYMENT: 'warning',
  CONFIRMED: 'brand',
  PROCESSING: 'info',
  DISPATCHED: 'info',
  DELIVERED: 'success',
  CANCELLED: 'neutral',
};

const QUOTATION_TONES: Record<QuotationStatus, Tone> = {
  DRAFT: 'neutral',
  SENT: 'brand',
  PENDING_APPROVAL: 'warning',
  ACCEPTED: 'success',
  REJECTED: 'danger',
  REVISION_REQUESTED: 'warning',
  EXPIRED: 'neutral',
  SUPERSEDED: 'neutral',
};

const RFQ_TONES: Record<RfqStatus, Tone> = {
  SUBMITTED: 'brand',
  IN_REVIEW: 'info',
  QUOTED: 'success',
  CLOSED: 'neutral',
  CANCELLED: 'neutral',
};

const ORG_TONES: Record<OrgStatus, Tone> = {
  PENDING_VERIFICATION: 'warning',
  ACTIVE: 'success',
  SUSPENDED: 'danger',
};

const PAYMENT_TONES: Record<PaymentStatus, Tone> = {
  UNPAID: 'warning',
  PAID: 'success',
  REFUNDED: 'neutral',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={ORDER_TONES[status]}>{ORDER_STATUS_LABELS[status]}</Badge>;
}

export function QuotationStatusBadge({ status, expired }: { status: QuotationStatus; expired?: boolean }) {
  if (expired && (status === 'SENT' || status === 'PENDING_APPROVAL')) {
    return <Badge tone="neutral">Expired</Badge>;
  }
  return <Badge tone={QUOTATION_TONES[status]}>{QUOTATION_STATUS_LABELS[status]}</Badge>;
}

export function RfqStatusBadge({ status }: { status: RfqStatus }) {
  return <Badge tone={RFQ_TONES[status]}>{RFQ_STATUS_LABELS[status]}</Badge>;
}

export function OrgStatusBadge({ status }: { status: OrgStatus }) {
  return <Badge tone={ORG_TONES[status]}>{ORG_STATUS_LABELS[status]}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <Badge tone={PAYMENT_TONES[status]}>{PAYMENT_STATUS_LABELS[status]}</Badge>;
}
