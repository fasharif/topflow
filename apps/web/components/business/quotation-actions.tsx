'use client';

import {
  ApprovalDecision,
  OrgPermission,
  OrgStatus,
  QuotationResponse,
  QuotationStatus,
  approvalDecisionSchema,
  fromFils,
  requiresApproval,
  respondQuotationSchema,
  toFils,
  type Fils,
  type QuotationDto,
} from '@topflow/shared';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Card, CardHeader, Field, Input, Textarea, cx } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from '@/lib/forms';
import { aed, formatDate, formatDateTime } from '@/lib/format';
import { useOrg } from './use-org';

/** Value that counts against spending limits: goods after discount plus delivery, excluding VAT (same rule as the API). */
export function netPurchaseFils(quotation: Pick<QuotationDto, 'subtotal' | 'deliveryFee'>): Fils {
  return toFils(quotation.subtotal) + toFils(quotation.deliveryFee);
}

type OnUpdated = (quotation: QuotationDto, message: string) => void;

const RESPONSE_OPTIONS: Array<{ value: QuotationResponse; label: string }> = [
  { value: QuotationResponse.ACCEPT, label: 'Accept' },
  { value: QuotationResponse.REQUEST_REVISION, label: 'Request changes' },
  { value: QuotationResponse.REJECT, label: 'Reject' },
];

function responseMessage(action: QuotationResponse, updated: QuotationDto, organizationName: string): string {
  if (action === QuotationResponse.ACCEPT) {
    return updated.status === QuotationStatus.PENDING_APPROVAL
      ? `Sent for approval. Approvers at ${organizationName} have been notified by email.`
      : `Quotation accepted${updated.orderNumber ? ` — sales order ${updated.orderNumber} has been created` : ''}.`;
  }
  if (action === QuotationResponse.REQUEST_REVISION) {
    return 'Revision requested. Our sales team will send you an updated quotation.';
  }
  return 'Quotation rejected and the request closed.';
}

/** Accept (with optional PO number), request a revision, or reject a SENT quotation. */
export function RespondPanel({ quotation, onUpdated }: { quotation: QuotationDto; onUpdated: OnUpdated }) {
  const { membership, approvalLimitFils } = useOrg();
  const [action, setAction] = useState<QuotationResponse>(QuotationResponse.ACCEPT);
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!membership) return null;

  const netFils = netPurchaseFils(quotation);
  const needsApproval = requiresApproval({ orgRole: membership.role, approvalLimitFils }, netFils);
  const verified = membership.organizationStatus === OrgStatus.ACTIVE;
  const accepting = action === QuotationResponse.ACCEPT;

  const choose = (next: QuotationResponse) => {
    setAction(next);
    setErrors({});
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const parsed = respondQuotationSchema.safeParse({
      action,
      purchaseOrderNumber: accepting ? purchaseOrderNumber : undefined,
      note,
    });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const updated = await api<QuotationDto>(`/org/quotations/${quotation.id}/respond`, { method: 'POST', org: true, body: parsed.data });
      onUpdated(updated, responseMessage(action, updated, membership.organizationName));
    } catch (err) {
      setError(errorMessage(err));
      setErrors(apiFieldErrors(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card tone="brand">
      <CardHeader title="Your response" description={`This offer is valid until ${formatDate(quotation.validUntil)}.`} />
      <form onSubmit={submit} className="space-y-4 p-5" noValidate>
        <fieldset>
          <legend className="sr-only">Choose a response</legend>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-brand-100 p-1 text-sm">
            {RESPONSE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={cx(
                  'cursor-pointer rounded-md px-2 py-1.5 text-center font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-flow-600',
                  action === option.value
                    ? 'bg-white text-brand-800 shadow-xs ring-1 ring-brand-600 ring-inset'
                    : 'text-slate-700 hover:bg-white/70 hover:text-ink-900',
                )}
              >
                <input
                  type="radio"
                  name="quotation-response"
                  value={option.value}
                  checked={action === option.value}
                  onChange={() => choose(option.value)}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        {accepting ? (
          <>
            <div className="rounded-lg border border-brand-200 bg-white px-4 py-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-slate-600">You commit to</span>
                <span className="text-lg font-semibold tabular-nums text-ink-900">{aed(quotation.total)}</span>
              </div>
              <p className="mt-0.5 text-right text-xs text-slate-600">incl. VAT · net {aed(fromFils(netFils))}</p>
            </div>

            {!verified ? (
              <Alert tone="warning" title={membership.organizationStatus === OrgStatus.SUSPENDED ? 'Trade account suspended' : 'Account verification pending'}>
                {membership.organizationStatus === OrgStatus.SUSPENDED
                  ? 'Purchasing is paused for this account. Contact Top Flow to restore it. You can still request changes or reject the quotation.'
                  : `Top Flow must verify ${membership.organizationName} before quotations can be accepted. You can still request changes or reject it.`}
              </Alert>
            ) : (
              needsApproval && (
                <Alert tone="warning" title="Approval required">
                  This exceeds your purchasing limit — it will be sent to an approver.{' '}
                  {approvalLimitFils === null
                    ? 'Buyers without a personal limit need sign-off for every purchase.'
                    : `Net value ${aed(fromFils(netFils))} is above your limit of ${aed(fromFils(approvalLimitFils))}.`}
                </Alert>
              )
            )}

            <Field label="Purchase order number" htmlFor="response-po" error={errors.purchaseOrderNumber} hint="Printed on the sales order and invoice" optional>
              <Input
                id="response-po"
                value={purchaseOrderNumber}
                onChange={(e) => setPurchaseOrderNumber(e.target.value)}
                maxLength={60}
                disabled={!verified}
                aria-invalid={Boolean(errors.purchaseOrderNumber)}
                placeholder="e.g. PO-2026-0142"
              />
            </Field>
            <Field label={needsApproval ? 'Note for the approver' : 'Note'} htmlFor="response-note" error={errors.note} optional>
              <Textarea id="response-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} disabled={!verified} aria-invalid={Boolean(errors.note)} />
            </Field>
          </>
        ) : (
          <Field
            label={action === QuotationResponse.REJECT ? 'Reason for rejecting' : 'What should we change?'}
            htmlFor="response-note"
            error={errors.note}
            hint={action === QuotationResponse.REJECT ? 'Required. Rejecting closes this request.' : 'Required — e.g. quantities, delivery date, alternative products or pricing.'}
          >
            <Textarea id="response-note" rows={4} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} aria-invalid={Boolean(errors.note)} />
          </Field>
        )}

        {error && <Alert tone="danger">{error}</Alert>}

        {accepting ? (
          <>
            <Button type="submit" size="lg" className="w-full" loading={submitting} disabled={!verified}>
              {needsApproval ? 'Send for approval' : 'Accept quotation'}
            </Button>
            {verified && (
              <p className="text-center text-xs text-slate-600">
                {needsApproval
                  ? 'An approver or owner reviews the purchase before an order is created.'
                  : 'Accepting creates a sales order on your account at the prices shown.'}
              </p>
            )}
          </>
        ) : action === QuotationResponse.REJECT ? (
          <Button type="submit" variant="danger" size="lg" className="w-full" loading={submitting}>
            Reject quotation
          </Button>
        ) : (
          <Button type="submit" variant="dark" size="lg" className="w-full" loading={submitting}>
            Request revision
          </Button>
        )}
      </form>
    </Card>
  );
}

/** Approver sign-off for a PENDING_APPROVAL quotation, or a clear "who we're waiting for" state. */
export function ApprovalPanel({ quotation, onUpdated }: { quotation: QuotationDto; onUpdated: OnUpdated }) {
  const { user, membership, can, approvalLimitFils } = useOrg();
  const [note, setNote] = useState('');
  const [pending, setPending] = useState<ApprovalDecision | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);

  if (!membership || !user) return null;

  const requester = quotation.respondedBy;
  const netFils = netPurchaseFils(quotation);
  const isApprover = can(OrgPermission.PURCHASE_APPROVE);
  const ownRequest = requester?.id === user.id;
  const withinLimit = !requiresApproval({ orgRole: membership.role, approvalLimitFils }, netFils);
  const canDecide = isApprover && !ownRequest && withinLimit;

  const decide = async (decision: ApprovalDecision) => {
    setError(null);
    const parsed = approvalDecisionSchema.safeParse({ decision, note });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(decision);
    try {
      const updated = await api<QuotationDto>(`/org/quotations/${quotation.id}/approval`, { method: 'POST', org: true, body: parsed.data });
      onUpdated(
        updated,
        decision === ApprovalDecision.APPROVE
          ? `Purchase approved${updated.orderNumber ? ` — sales order ${updated.orderNumber} has been created` : ''}.`
          : 'Approval declined. The quotation is open again so the buyer can request changes or reject it.',
      );
    } catch (err) {
      setError(errorMessage(err));
      setErrors(apiFieldErrors(err));
    } finally {
      setPending(null);
    }
  };

  return (
    <Card tone="warning">
      <CardHeader title={canDecide ? 'Your approval is needed' : 'Waiting for approval'} description={`Net value ${aed(fromFils(netFils))} excl. VAT`} />
      <div className="space-y-4 p-5 text-sm">
        <dl className="space-y-2">
          <div className="flex justify-between gap-3">
            <dt className="text-slate-600">Requested by</dt>
            <dd className="text-right font-medium text-ink-900">{ownRequest ? 'You' : (requester?.fullName ?? '—')}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-600">Requested on</dt>
            <dd className="text-right text-ink-900">{formatDateTime(quotation.respondedAt)}</dd>
          </div>
          {quotation.purchaseOrderNumber && (
            <div className="flex justify-between gap-3">
              <dt className="text-slate-600">PO number</dt>
              <dd className="text-right font-mono text-ink-900">{quotation.purchaseOrderNumber}</dd>
            </div>
          )}
        </dl>
        {quotation.responseNote && (
          <blockquote className="rounded-lg border-l-4 border-warning-500 bg-white px-3 py-2 text-slate-700">{quotation.responseNote}</blockquote>
        )}

        {canDecide ? (
          <>
            <Field label="Note" htmlFor="approval-note" error={errors.note} hint="Shared with the requester — useful when declining" optional>
              <Textarea id="approval-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} aria-invalid={Boolean(errors.note)} />
            </Field>
            {error && <Alert tone="danger">{error}</Alert>}
            <div className="grid gap-2 sm:grid-cols-2">
              <Button size="lg" loading={pending === ApprovalDecision.APPROVE} disabled={pending !== null} onClick={() => void decide(ApprovalDecision.APPROVE)}>
                Approve purchase
              </Button>
              <Button variant="secondary" size="lg" loading={pending === ApprovalDecision.DECLINE} disabled={pending !== null} onClick={() => void decide(ApprovalDecision.DECLINE)}>
                Decline
              </Button>
            </div>
            <p className="text-xs text-slate-600">Approving creates the sales order. Declining re-opens the quotation for the buyer.</p>
          </>
        ) : (
          <Alert tone="info">
            {ownRequest
              ? 'You sent this purchase for approval. Another approver or an owner must sign off — nobody can approve their own purchase.'
              : isApprover
                ? `This purchase is above your approval limit${approvalLimitFils !== null ? ` of ${aed(fromFils(approvalLimitFils))}` : ''}. An owner or an approver with a higher limit must sign off.`
                : `An approver or owner at ${membership.organizationName} needs to sign off. They have been notified by email.`}
          </Alert>
        )}
      </div>
    </Card>
  );
}
