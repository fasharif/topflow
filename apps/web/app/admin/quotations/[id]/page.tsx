'use client';

import {
  OrgStatus,
  Permission,
  QuotationStatus,
  hasPermission,
  updateQuotationSchema,
  type DocumentLineDto,
  type MemberDto,
  type OrganizationDto,
  type QuotationDto,
} from '@topflow/shared';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { DetailList, QueryError, SectionLabel } from '@/components/admin/detail';
import { DocumentLinesTable, DocumentTotals } from '@/components/admin/document-lines';
import {
  QuotationLinesCard,
  QuotationSettingsFields,
  QuotationTermsCard,
  QuotationTotalsPreview,
  lineFromDocument,
  linesPayload,
  type QuotationFormValues,
} from '@/components/admin/quotation-line-editor';
import { RequireAuth } from '@/components/require-auth';
import { QuotationStatusBadge } from '@/components/status-badge';
import { Alert, Button, Card, CardHeader, LoadingBlock, PageHeader } from '@/components/ui';
import { api, downloadFile, errorMessage } from '@/lib/api';
import { formatDate, formatDateTime, pluralize } from '@/lib/format';
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from '@/lib/forms';
import { useSession } from '@/lib/session';
import { useApiQuery } from '@/lib/use-api';

const DAY_MS = 24 * 60 * 60 * 1000;
const REVISABLE: readonly QuotationStatus[] = [
  QuotationStatus.SENT,
  QuotationStatus.REVISION_REQUESTED,
  QuotationStatus.PENDING_APPROVAL,
  QuotationStatus.EXPIRED,
];

interface Feedback {
  tone: 'success' | 'danger';
  message: string;
}

function valuesFromQuotation(quotation: QuotationDto): QuotationFormValues {
  return {
    lines: quotation.items.filter((line): line is DocumentLineDto & { productId: string } => line.productId !== null).map((line) => lineFromDocument(line)),
    deliveryFee: quotation.deliveryFee === '0.00' ? '' : quotation.deliveryFee,
    // The server derives the validity period from validUntil − createdAt when the draft is sent.
    validityDays: String(Math.max(1, Math.round((Date.parse(quotation.validUntil) - Date.parse(quotation.createdAt)) / DAY_MS))),
    notes: quotation.notes ?? '',
    terms: quotation.terms ?? '',
    internalNotes: quotation.internalNotes ?? '',
  };
}

// ─── Draft editing ─────────────────────────────────────────────────────────

function DraftQuotationForm({
  quotation,
  defaultDiscount,
  onSaved,
}: {
  quotation: QuotationDto;
  defaultDiscount: string | null;
  onSaved: (quotation: QuotationDto, feedback: Feedback) => void;
}) {
  const router = useRouter();
  const [initial] = useState(() => valuesFromQuotation(quotation));
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'send' | 'discard' | null>(null);
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const orphaned = quotation.items.filter((line) => line.productId === null);

  /** Validated PATCH body, or null (with field errors shown) when the form is invalid. */
  const updateBody = () => {
    const parsed = updateQuotationSchema.safeParse({
      items: linesPayload(values.lines),
      deliveryFee: values.deliveryFee.trim() || '0',
      // Only resend the validity when it changed: the server restarts the period from "now".
      ...(values.validityDays !== initial.validityDays && { validityDays: Number(values.validityDays) }),
      notes: values.notes,
      terms: values.terms,
      internalNotes: values.internalNotes,
    });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      setError('Please fix the highlighted fields.');
      return null;
    }
    setErrors({});
    return parsed.data;
  };

  const patch = (body: NonNullable<ReturnType<typeof updateBody>>) =>
    api<QuotationDto>(`/admin/quotations/${quotation.id}`, { method: 'PATCH', body });

  const save = async () => {
    setError(null);
    const body = updateBody();
    if (!body) return;
    setBusy('save');
    try {
      onSaved(await patch(body), { tone: 'success', message: 'Draft saved.' });
    } catch (err) {
      setError(errorMessage(err));
      setErrors(apiFieldErrors(err));
      setBusy(null);
    }
  };

  const send = async () => {
    setError(null);
    const body = dirty ? updateBody() : null;
    if (dirty && !body) return;
    const recipient = quotation.customer ? `${quotation.customer.fullName}${quotation.customer.email ? ` (${quotation.customer.email})` : ''}` : 'the customer';
    if (!window.confirm(`Send ${quotation.displayNumber} to ${recipient}? They will be emailed a link to review it.`)) return;

    setBusy('send');
    let saved: QuotationDto | null = null;
    try {
      if (body) saved = await patch(body);
      const sent = await api<QuotationDto>(`/admin/quotations/${quotation.id}/send`, { method: 'POST' });
      onSaved(sent, { tone: 'success', message: `${sent.displayNumber} was sent to ${recipient}.` });
    } catch (err) {
      if (saved) {
        // The changes were saved but sending failed: show the saved draft with the error.
        onSaved(saved, { tone: 'danger', message: `Your changes were saved, but the quotation was not sent: ${errorMessage(err)}` });
        return;
      }
      setError(errorMessage(err));
      setErrors(apiFieldErrors(err));
      setBusy(null);
    }
  };

  const discard = async () => {
    if (!window.confirm(`Discard draft ${quotation.displayNumber}? This cannot be undone.`)) return;
    setError(null);
    setBusy('discard');
    try {
      await api<void>(`/admin/quotations/${quotation.id}`, { method: 'DELETE' });
      router.push('/admin/quotations');
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      {orphaned.length > 0 && (
        <Alert tone="warning" title={`${pluralize(orphaned.length, 'line')} no longer in the catalog`}>
          {orphaned.map((line) => `${line.productName} (${line.sku})`).join(', ')} will be removed the next time the draft is saved.
        </Alert>
      )}

      <QuotationLinesCard values={values} onChange={setValues} errors={errors} defaultDiscount={defaultDiscount} disabled={busy !== null} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <QuotationTermsCard values={values} onChange={setValues} errors={errors} disabled={busy !== null} />
        <Card className="h-fit space-y-5 p-5">
          <QuotationSettingsFields values={values} onChange={setValues} errors={errors} disabled={busy !== null} />
          <div className="border-t border-slate-100 pt-5">
            <QuotationTotalsPreview values={values} defaultDiscount={defaultDiscount} />
          </div>
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="space-y-2">
            <Button className="w-full" loading={busy === 'send'} disabled={busy !== null || values.lines.length === 0} onClick={send}>
              {dirty ? 'Save & send to customer' : 'Send to customer'}
            </Button>
            <Button className="w-full" variant="secondary" loading={busy === 'save'} disabled={busy !== null || !dirty} onClick={save}>
              {dirty ? 'Save draft' : 'All changes saved'}
            </Button>
            <button
              type="button"
              onClick={discard}
              disabled={busy !== null}
              className="inline-flex h-10 w-full items-center justify-center rounded-lg text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Discard draft
            </button>
          </div>
          {dirty && <p className="text-center text-xs text-amber-700">You have unsaved changes.</p>}
        </Card>
      </div>
    </div>
  );
}

// ─── Issued quotations (read-only) ─────────────────────────────────────────

function StatusCallout({ quotation }: { quotation: QuotationDto }) {
  const responder = quotation.respondedBy ? `${quotation.respondedBy.fullName}, ${formatDateTime(quotation.respondedAt)}` : null;
  switch (quotation.status) {
    case QuotationStatus.REVISION_REQUESTED:
      return (
        <Alert tone="warning" title="The customer requested a revision">
          {quotation.responseNote && <p className="whitespace-pre-line text-base">“{quotation.responseNote}”</p>}
          {responder && <p className="mt-1 text-xs">— {responder}</p>}
          <p className="mt-2">Create a revision to adjust the lines and send an updated offer.</p>
        </Alert>
      );
    case QuotationStatus.REJECTED:
      return (
        <Alert tone="danger" title="Rejected by the customer">
          {quotation.responseNote && <p className="whitespace-pre-line">“{quotation.responseNote}”</p>}
          {responder && <p className="mt-1 text-xs">— {responder}</p>}
        </Alert>
      );
    case QuotationStatus.PENDING_APPROVAL:
      return (
        <Alert tone="info" title="Waiting for the customer’s internal approval">
          Accepted by {quotation.respondedBy?.fullName ?? 'the buyer'} above their spending limit — an approver at {quotation.organization?.name ?? 'the organization'} must sign off.
          {quotation.purchaseOrderNumber && <> PO number {quotation.purchaseOrderNumber}.</>}
        </Alert>
      );
    case QuotationStatus.ACCEPTED:
      return (
        <Alert tone="success" title="Accepted">
          {quotation.approvedBy ? `Approved by ${quotation.approvedBy.fullName}, ${formatDateTime(quotation.approvedAt)}.` : 'Accepted by the customer.'}
          {quotation.orderId && (
            <>
              {' '}
              Order{' '}
              <Link href={`/admin/orders/${quotation.orderId}`} className="font-semibold underline">
                {quotation.orderNumber}
              </Link>{' '}
              was created.
            </>
          )}
          {quotation.responseNote && <p className="mt-1 whitespace-pre-line">“{quotation.responseNote}”</p>}
        </Alert>
      );
    case QuotationStatus.SUPERSEDED:
      return (
        <Alert tone="info" title="Superseded">
          A newer revision replaced this quotation.{' '}
          <Link href={`/admin/quotations?search=${encodeURIComponent(quotation.number)}`} className="font-semibold underline">
            See all revisions
          </Link>
        </Alert>
      );
    default:
      if (quotation.status === QuotationStatus.EXPIRED || quotation.isExpired) {
        return (
          <Alert tone="warning" title="Expired">
            The offer was valid until {formatDate(quotation.validUntil)}. Create a revision to re-quote with current prices.
          </Alert>
        );
      }
      if (quotation.status === QuotationStatus.SENT && quotation.responseNote) {
        return <Alert tone="info" title="Note on this quotation">{quotation.responseNote}</Alert>;
      }
      return null;
  }
}

function IssuedQuotation({ quotation, canSeeRfqs, canReviewOrganizations }: { quotation: QuotationDto; canSeeRfqs: boolean; canReviewOrganizations: boolean }) {
  return (
    <div className="space-y-6">
      <StatusCallout quotation={quotation} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="h-fit xl:order-last">
          <CardHeader title="Details" />
          <div className="p-5">
            <DetailList
              items={[
                {
                  label: 'Customer',
                  value: quotation.customer ? (
                    <>
                      <span className="block">{quotation.customer.fullName}</span>
                      {quotation.customer.email && (
                        <a href={`mailto:${quotation.customer.email}`} className="text-xs font-normal text-brand-700 hover:underline">
                          {quotation.customer.email}
                        </a>
                      )}
                    </>
                  ) : null,
                },
                {
                  label: 'Organization',
                  value: quotation.organization ? (
                    canReviewOrganizations ? (
                      <Link href={`/admin/organizations/${quotation.organization.id}`} className="text-brand-700 hover:underline">
                        {quotation.organization.name}
                      </Link>
                    ) : (
                      quotation.organization.name
                    )
                  ) : (
                    'Retail customer'
                  ),
                },
                { label: 'TRN', value: quotation.organization?.trn, hidden: !quotation.organization?.trn },
                {
                  label: 'RFQ',
                  hidden: !quotation.quoteRequest,
                  value:
                    quotation.quoteRequest && canSeeRfqs ? (
                      <Link href={`/admin/rfqs/${quotation.quoteRequest.id}`} className="text-brand-700 hover:underline">
                        {quotation.quoteRequest.number}
                      </Link>
                    ) : (
                      quotation.quoteRequest?.number
                    ),
                },
                { label: 'Prepared by', value: quotation.createdBy?.fullName },
                { label: 'Sent', value: quotation.sentAt ? formatDateTime(quotation.sentAt) : null },
                { label: 'Valid until', value: formatDate(quotation.validUntil) },
                {
                  label: 'Customer response',
                  hidden: !quotation.respondedAt,
                  value: `${quotation.respondedBy?.fullName ?? '—'}, ${formatDateTime(quotation.respondedAt)}`,
                },
                { label: 'PO number', value: quotation.purchaseOrderNumber },
                {
                  label: 'Approved by',
                  hidden: !quotation.approvedBy,
                  value: `${quotation.approvedBy?.fullName ?? '—'}, ${formatDateTime(quotation.approvedAt)}`,
                },
                {
                  label: 'Order',
                  hidden: !quotation.orderId,
                  value: (
                    <Link href={`/admin/orders/${quotation.orderId}`} className="text-brand-700 hover:underline">
                      {quotation.orderNumber}
                    </Link>
                  ),
                },
              ]}
            />
          </div>
        </Card>

        <div className="min-w-0 space-y-6">
          <section>
            <h2 className="mb-3 text-base font-semibold text-ink-900">
              Line items <span className="font-normal text-slate-500">· {pluralize(quotation.items.length, 'line')}</span>
            </h2>
            <DocumentLinesTable lines={quotation.items} showListPrice />
            <div className="mt-4 flex justify-end">
              <Card className="w-full p-5 sm:max-w-sm">
                <DocumentTotals
                  subtotal={quotation.subtotal}
                  discountTotal={quotation.discountTotal}
                  deliveryFee={quotation.deliveryFee}
                  vatAmount={quotation.vatAmount}
                  total={quotation.total}
                  vatRateBps={quotation.vatRateBps}
                />
              </Card>
            </div>
          </section>

          {(quotation.notes || quotation.terms) && (
            <Card className="space-y-4 p-5">
              {quotation.notes && (
                <div>
                  <SectionLabel>Notes for the customer</SectionLabel>
                  <p className="whitespace-pre-line text-sm text-slate-700">{quotation.notes}</p>
                </div>
              )}
              {quotation.terms && (
                <div>
                  <SectionLabel>Terms &amp; conditions</SectionLabel>
                  <p className="whitespace-pre-line text-sm text-slate-700">{quotation.terms}</p>
                </div>
              )}
            </Card>
          )}

          {quotation.internalNotes && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-5">
              <SectionLabel>Internal notes · staff only</SectionLabel>
              <p className="whitespace-pre-line text-sm text-slate-800">{quotation.internalNotes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

function QuotationDetail({ id }: { id: string }) {
  const router = useRouter();
  const { user } = useSession();
  const query = useApiQuery<QuotationDto>(`/admin/quotations/${id}`);
  const [updated, setUpdated] = useState<QuotationDto | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState<'pdf' | 'revise' | null>(null);
  const quotation = updated ?? query.data;

  const canReviewOrganizations = hasPermission(user?.role, Permission.ORGANIZATIONS_REVIEW);
  const canSeeRfqs = hasPermission(user?.role, Permission.RFQS_MANAGE);
  const draftOrganizationId = quotation?.status === QuotationStatus.DRAFT ? (quotation.organization?.id ?? null) : null;
  // The organization's default discount lets the draft preview match the server's pricing.
  const organization = useApiQuery<{ organization: OrganizationDto; members: MemberDto[] }>(
    draftOrganizationId && canReviewOrganizations ? `/admin/organizations/${draftOrganizationId}` : null,
  ).data?.organization;

  if (!quotation) {
    return query.error ? (
      <QueryError error={query.error} onRetry={query.reload} title="Could not load this quotation" backHref="/admin/quotations" backLabel="Back to quotations" />
    ) : (
      <LoadingBlock label="Loading quotation…" />
    );
  }

  const isDraft = quotation.status === QuotationStatus.DRAFT;
  const canRevise = REVISABLE.includes(quotation.status);
  const defaultDiscount = !quotation.organization
    ? '0.00'
    : organization
      ? organization.status === OrgStatus.ACTIVE
        ? organization.discountRate
        : '0.00'
      : null;

  const downloadPdf = async () => {
    setBusy('pdf');
    setFeedback(null);
    try {
      await downloadFile(`/admin/quotations/${quotation.id}/pdf`, {}, `${quotation.displayNumber}.pdf`);
    } catch (err) {
      setFeedback({ tone: 'danger', message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const revise = async () => {
    setBusy('revise');
    setFeedback(null);
    try {
      const draft = await api<QuotationDto>(`/admin/quotations/${quotation.id}/revise`, { method: 'POST', body: {} });
      router.push(`/admin/quotations/${draft.id}`);
    } catch (err) {
      setFeedback({ tone: 'danger', message: errorMessage(err) });
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/admin/quotations" className="hover:underline">
            ← Quotations
          </Link>
        }
        title={quotation.displayNumber}
        description={
          <>
            {quotation.organization?.name ?? quotation.customer?.fullName ?? '—'}
            {quotation.quoteRequest && (
              <>
                {' · for '}
                {canSeeRfqs ? (
                  <Link href={`/admin/rfqs/${quotation.quoteRequest.id}`} className="font-medium text-brand-700 hover:underline">
                    {quotation.quoteRequest.number}
                  </Link>
                ) : (
                  quotation.quoteRequest.number
                )}
              </>
            )}
            {isDraft ? ` · draft started ${formatDate(quotation.createdAt)}` : ` · valid until ${formatDate(quotation.validUntil)}`}
          </>
        }
        actions={
          <>
            <QuotationStatusBadge status={quotation.status} expired={quotation.isExpired} />
            <Button variant="secondary" size="sm" loading={busy === 'pdf'} disabled={busy !== null} onClick={downloadPdf}>
              Download PDF
            </Button>
            {canRevise && (
              <Button size="sm" loading={busy === 'revise'} disabled={busy !== null} onClick={revise}>
                Create revision
              </Button>
            )}
          </>
        }
      />

      {feedback && (
        <div className="mb-6">
          <Alert tone={feedback.tone}>{feedback.message}</Alert>
        </div>
      )}

      {isDraft ? (
        <DraftQuotationForm
          key={quotation.updatedAt}
          quotation={quotation}
          defaultDiscount={defaultDiscount}
          onSaved={(next, message) => {
            setUpdated(next);
            setFeedback(message);
          }}
        />
      ) : (
        <IssuedQuotation quotation={quotation} canSeeRfqs={canSeeRfqs} canReviewOrganizations={canReviewOrganizations} />
      )}
    </>
  );
}

export default function AdminQuotationPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireAuth permission={Permission.QUOTATIONS_MANAGE}>
      <QuotationDetail key={id} id={id} />
    </RequireAuth>
  );
}
