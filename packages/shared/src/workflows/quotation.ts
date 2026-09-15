import { QuotationStatus, RfqStatus } from '../enums';
import type { TransitionMap } from './state-machine';

/**
 * Quotation lifecycle (one row per revision):
 *
 *   DRAFT ─► SENT ─┬─► ACCEPTED                      (customer accepts within their limit)
 *                  ├─► PENDING_APPROVAL ─┬─► ACCEPTED (approver signs off)
 *                  │                     ├─► SENT     (approver declines; quote stays open)
 *                  │                     └─► REJECTED
 *                  ├─► REJECTED
 *                  ├─► REVISION_REQUESTED ─► SUPERSEDED (sales issues revision n+1)
 *                  ├─► SUPERSEDED
 *                  └─► EXPIRED
 */
export const QUOTATION_TRANSITIONS: TransitionMap<QuotationStatus> = {
  [QuotationStatus.DRAFT]: [QuotationStatus.SENT],
  [QuotationStatus.SENT]: [
    QuotationStatus.PENDING_APPROVAL,
    QuotationStatus.ACCEPTED,
    QuotationStatus.REJECTED,
    QuotationStatus.REVISION_REQUESTED,
    QuotationStatus.SUPERSEDED,
    QuotationStatus.EXPIRED,
  ],
  [QuotationStatus.PENDING_APPROVAL]: [
    QuotationStatus.ACCEPTED,
    QuotationStatus.SENT,
    QuotationStatus.REJECTED,
    QuotationStatus.SUPERSEDED,
    QuotationStatus.EXPIRED,
  ],
  [QuotationStatus.REVISION_REQUESTED]: [QuotationStatus.SUPERSEDED],
  [QuotationStatus.ACCEPTED]: [],
  [QuotationStatus.REJECTED]: [],
  [QuotationStatus.EXPIRED]: [],
  [QuotationStatus.SUPERSEDED]: [],
};

/**
 * RFQ lifecycle:  SUBMITTED ─► IN_REVIEW ─► QUOTED ─► CLOSED
 * A revision request re-opens a QUOTED RFQ; CANCELLED is available until it is quoted.
 */
export const RFQ_TRANSITIONS: TransitionMap<RfqStatus> = {
  [RfqStatus.SUBMITTED]: [RfqStatus.IN_REVIEW, RfqStatus.QUOTED, RfqStatus.CANCELLED],
  [RfqStatus.IN_REVIEW]: [RfqStatus.QUOTED, RfqStatus.CLOSED, RfqStatus.CANCELLED],
  [RfqStatus.QUOTED]: [RfqStatus.IN_REVIEW, RfqStatus.CLOSED],
  [RfqStatus.CLOSED]: [],
  [RfqStatus.CANCELLED]: [],
};

export const QuotationResponse = {
  ACCEPT: 'ACCEPT',
  REJECT: 'REJECT',
  REQUEST_REVISION: 'REQUEST_REVISION',
} as const;
export type QuotationResponse = (typeof QuotationResponse)[keyof typeof QuotationResponse];

export const ApprovalDecision = {
  APPROVE: 'APPROVE',
  DECLINE: 'DECLINE',
} as const;
export type ApprovalDecision = (typeof ApprovalDecision)[keyof typeof ApprovalDecision];

/** A quotation the customer can still act on. */
export function isQuotationOpen(status: QuotationStatus): boolean {
  return status === QuotationStatus.SENT || status === QuotationStatus.PENDING_APPROVAL;
}

export function isQuotationExpired(validUntil: Date | string, now: Date = new Date()): boolean {
  return new Date(validUntil).getTime() < now.getTime();
}
