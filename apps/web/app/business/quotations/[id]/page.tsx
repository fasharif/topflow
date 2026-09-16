'use client';

import { OrgPermission, QuotationStatus, type QuotationDto } from '@topflow/shared';
import { Check, Download } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { DetailItem, DetailList, Prose } from '@/components/business/detail-list';
import { DocumentLines, DocumentTotals } from '@/components/business/document-lines';
import { BackLink, LoadError } from '@/components/business/feedback';
import { ApprovalPanel, RespondPanel } from '@/components/business/quotation-actions';
import { useOrg } from '@/components/business/use-org';
import { QuotationStatusBadge } from '@/components/status-badge';
import { Alert, Button, Card, CardHeader, LinkButton, LoadingBlock, buttonClass } from '@/components/ui';
import { downloadFile, errorMessage } from '@/lib/api';
import { formatDate, formatDateTime, pluralize } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api';

function DownloadPdfButton({ quotation }: { quotation: QuotationDto }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      await downloadFile(`/org/quotations/${quotation.id}/pdf`, { org: true }, `${quotation.displayNumber.replace(/\s+/g, '-')}.pdf`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button variant="secondary" loading={busy} onClick={() => void download()}>
        {!busy && <Download aria-hidden="true" />}
        Download PDF
      </Button>
      {error && (
        <p role="alert" className="text-xs text-danger-600">
          {error}
        </p>
      )}
    </div>
  );
}

/** What is going on with this quotation, in one sentence, plus the order link once accepted. */
function StatusBanner({ quotation }: { quotation: QuotationDto }) {
  const rfqLink = quotation.quoteRequest && (
    <Link href={`/business/rfqs/${quotation.quoteRequest.id}`} className="font-medium underline underline-offset-2 hover:no-underline">
      {quotation.quoteRequest.number}
    </Link>
  );
  const requester = quotation.respondedBy?.fullName ?? 'A colleague';

  if (quotation.orderId) {
    const approvedSeparately = quotation.approvedBy && quotation.approvedBy.id !== quotation.respondedBy?.id;
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-success-200 bg-success-50 p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-success-600 text-white">
            <Check aria-hidden="true" className="size-5" />
          </span>
          <div>
            <p className="font-semibold text-success-900">
              Accepted{approvedSeparately ? ' and approved' : ''} — order {quotation.orderNumber} created
            </p>
            <p className="text-sm text-success-800">
              {approvedSeparately
                ? `Accepted by ${requester}, approved by ${quotation.approvedBy?.fullName} on ${formatDateTime(quotation.approvedAt)}.`
                : `Accepted by ${requester} on ${formatDateTime(quotation.respondedAt)}.`}
            </p>
          </div>
        </div>
        <LinkButton href={`/business/orders/${quotation.orderId}`}>View order {quotation.orderNumber}</LinkButton>
      </div>
    );
  }

  if (quotation.isExpired) {
    return (
      <Alert tone="warning" title="This quotation has expired">
        It was valid until {formatDate(quotation.validUntil)} and can no longer be accepted. Contact your Top Flow sales representative
        {quotation.quoteRequest ? <> about {rfqLink}</> : null} or submit a new RFQ from your cart for updated prices.
      </Alert>
    );
  }

  switch (quotation.status) {
    case QuotationStatus.SENT:
      // Back to SENT after a response can only mean an approver declined the purchase.
      return quotation.respondedAt ? (
        <Alert tone="warning" title="An approver declined the earlier acceptance">
          {quotation.responseNote && <>&ldquo;{quotation.responseNote}&rdquo; </>}
          The offer is still open — you can accept again, request changes or reject it.
        </Alert>
      ) : null;
    case QuotationStatus.PENDING_APPROVAL:
      return (
        <Alert tone="warning" title="Waiting for internal approval">
          {requester} accepted this quotation on {formatDateTime(quotation.respondedAt)}, above their purchasing limit. An approver or owner must sign off
          before the order is created.
        </Alert>
      );
    case QuotationStatus.ACCEPTED:
      return <Alert tone="success" title="Accepted">This quotation has been accepted.</Alert>;
    case QuotationStatus.REJECTED:
      return (
        <Alert tone="warning" title={`Rejected by ${requester} on ${formatDate(quotation.respondedAt)}`}>
          {quotation.responseNote ?? 'No reason was given.'}
        </Alert>
      );
    case QuotationStatus.REVISION_REQUESTED:
      return (
        <Alert tone="info" title="Revision requested">
          Our sales team is preparing an updated quotation. The new revision will appear on {rfqLink ?? 'your quotations list'} once issued.
        </Alert>
      );
    case QuotationStatus.SUPERSEDED:
      return (
        <Alert tone="info" title="Superseded by a newer revision">
          This version is no longer valid. {rfqLink ? <>Open {rfqLink} to see the latest quotation.</> : 'See your quotations list for the latest version.'}
        </Alert>
      );
    default:
      return null;
  }
}

function responseLabel(status: QuotationStatus): string {
  switch (status) {
    case QuotationStatus.ACCEPTED:
      return 'Accepted by';
    case QuotationStatus.PENDING_APPROVAL:
    case QuotationStatus.SENT:
      return 'Sent for approval by';
    case QuotationStatus.REJECTED:
      return 'Rejected by';
    case QuotationStatus.REVISION_REQUESTED:
      return 'Changes requested by';
    default:
      return 'Responded by';
  }
}

function ResponseCard({ quotation }: { quotation: QuotationDto }) {
  if (!quotation.respondedAt) return null;
  const declined = quotation.status === QuotationStatus.SENT;
  const approver = quotation.status === QuotationStatus.ACCEPTED ? quotation.approvedBy : null;

  return (
    <Card>
      <CardHeader title={declined ? 'Previous response' : 'Response'} />
      <DetailList>
        <DetailItem stacked label={responseLabel(quotation.status)}>
          {quotation.respondedBy?.fullName ?? '—'}
          <span className="block text-slate-500">{formatDateTime(quotation.respondedAt)}</span>
        </DetailItem>
        {quotation.responseNote && (
          <DetailItem stacked label={declined ? 'Approver’s note' : 'Note'}>
            <Prose>{quotation.responseNote}</Prose>
          </DetailItem>
        )}
        {approver && (
          <DetailItem stacked label="Approved by">
            {approver.id === quotation.respondedBy?.id ? `${approver.fullName} (within purchasing limit)` : approver.fullName}
            <span className="block text-slate-500">{formatDateTime(quotation.approvedAt)}</span>
          </DetailItem>
        )}
      </DetailList>
    </Card>
  );
}

function QuotationView({ initial }: { initial: QuotationDto }) {
  const { can } = useOrg();
  const [quotation, setQuotation] = useState(initial);
  const [notice, setNotice] = useState<string | null>(null);

  const canRespond = quotation.status === QuotationStatus.SENT && !quotation.isExpired && can(OrgPermission.QUOTE_RESPOND);
  const awaitingApproval = quotation.status === QuotationStatus.PENDING_APPROVAL && !quotation.isExpired;

  const onUpdated = (updated: QuotationDto, message: string) => {
    setQuotation(updated);
    setNotice(message);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div>
      <BackLink href="/business/quotations">All quotations</BackLink>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow text-brand-700">Quotation{quotation.revision > 1 ? ` · revision ${quotation.revision}` : ''}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="heading-1 font-mono text-ink-900">{quotation.displayNumber}</h1>
            <QuotationStatusBadge status={quotation.status} expired={quotation.isExpired} />
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Issued {formatDate(quotation.sentAt)} · {quotation.isExpired ? 'expired' : 'valid until'} {formatDate(quotation.validUntil)}
            {quotation.quoteRequest && (
              <>
                {' · for '}
                <Link href={`/business/rfqs/${quotation.quoteRequest.id}`} className="font-medium text-brand-700 underline-offset-4 hover:underline">
                  {quotation.quoteRequest.number}
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {(canRespond || awaitingApproval) && (
            <a href="#decision" className={buttonClass('primary', 'md', 'xl:hidden')}>
              {canRespond ? 'Respond' : 'Review approval'}
            </a>
          )}
          <DownloadPdfButton quotation={quotation} />
        </div>
      </header>

      <div className="mb-6 space-y-3 empty:hidden">
        {notice && <Alert tone="success">{notice}</Alert>}
        <StatusBanner quotation={quotation} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <Card className="overflow-hidden">
            <CardHeader title="Pricing" description={`${pluralize(quotation.items.length, 'line')} · amounts in ${quotation.currency}`} />
            <DocumentLines items={quotation.items} />
            <div className="border-t border-slate-200 bg-slate-50 px-5 py-4">
              <div className="sm:ml-auto sm:max-w-sm">
                <DocumentTotals
                  subtotal={quotation.subtotal}
                  discountTotal={quotation.discountTotal}
                  deliveryFee={quotation.deliveryFee}
                  vatAmount={quotation.vatAmount}
                  vatRateBps={quotation.vatRateBps}
                  total={quotation.total}
                />
              </div>
            </div>
          </Card>

          {(quotation.notes || quotation.terms) && (
            <Card>
              <CardHeader title="Notes & terms" />
              <div className="space-y-5 px-5 py-4">
                {quotation.notes && (
                  <section>
                    <h3 className="eyebrow mb-1.5 text-slate-600">Notes from Top Flow</h3>
                    <Prose>{quotation.notes}</Prose>
                  </section>
                )}
                {quotation.terms && (
                  <section>
                    <h3 className="eyebrow mb-1.5 text-slate-600">Terms &amp; conditions</h3>
                    <Prose>{quotation.terms}</Prose>
                  </section>
                )}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {(canRespond || awaitingApproval) && (
            // The sticky header offset comes from the global scroll-padding, so no scroll margin is needed here.
            <div id="decision">
              {canRespond ? <RespondPanel quotation={quotation} onUpdated={onUpdated} /> : <ApprovalPanel quotation={quotation} onUpdated={onUpdated} />}
            </div>
          )}

          <ResponseCard quotation={quotation} />

          <Card>
            <CardHeader title="Details" />
            <DetailList>
              <DetailItem stacked label="Prepared for">
                {quotation.organization && (
                  <>
                    {quotation.organization.name}
                    {quotation.organization.trn && <span className="block text-slate-500">TRN {quotation.organization.trn}</span>}
                  </>
                )}
              </DetailItem>
              <DetailItem stacked label="Contact">
                {quotation.customer && (
                  <>
                    {quotation.customer.fullName}
                    {quotation.customer.email && <span className="block text-slate-500">{quotation.customer.email}</span>}
                  </>
                )}
              </DetailItem>
              <DetailItem stacked label="Prepared by">{quotation.createdBy ? `${quotation.createdBy.fullName}, Top Flow` : null}</DetailItem>
              <DetailItem stacked label="Issued">{quotation.sentAt ? formatDateTime(quotation.sentAt) : null}</DetailItem>
              <DetailItem stacked label="Valid until">{formatDate(quotation.validUntil)}</DetailItem>
              <DetailItem stacked label="Purchase order number">
                {quotation.purchaseOrderNumber && <span className="font-mono">{quotation.purchaseOrderNumber}</span>}
              </DetailItem>
            </DetailList>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function QuotationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = useApiQuery<QuotationDto>(`/org/quotations/${id}`, { org: true });

  if (error) {
    return (
      <div>
        <BackLink href="/business/quotations">All quotations</BackLink>
        <LoadError
          error={error}
          onRetry={reload}
          notFound={{
            title: 'Quotation not found',
            description: 'It may belong to another organization you are a member of, or it has not been issued yet.',
            href: '/business/quotations',
            label: 'Back to quotations',
          }}
        />
      </div>
    );
  }
  if (!data || data.id !== id) return <LoadingBlock label="Loading quotation…" />;
  return <QuotationView key={`${data.id}:${data.updatedAt}`} initial={data} />;
}
