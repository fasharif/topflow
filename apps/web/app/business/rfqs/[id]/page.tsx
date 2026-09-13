'use client';

import { OrgPermission, QuotationStatus, RfqStatus, isQuotationOpen, type QuotationSummaryDto, type RfqDto } from '@topflow/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AddressBlock, DetailItem, DetailList, Prose } from '@/components/business/detail-list';
import { BackLink, ConfirmAction, FlagAlert, LoadError } from '@/components/business/feedback';
import { useOrg } from '@/components/business/use-org';
import { QuotationStatusBadge, RfqStatusBadge } from '@/components/status-badge';
import { Alert, Badge, Card, CardHeader, LinkButton, LoadingBlock } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { aed, formatDate, formatDateTime, pluralize } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api';

function statusGuidance(rfq: RfqDto): { tone: 'info' | 'success' | 'warning'; title: string; body: string } | null {
  switch (rfq.status) {
    case RfqStatus.SUBMITTED:
      return { tone: 'info', title: 'Received by our sales team', body: 'We are checking stock and pricing for your items and will email you as soon as the quotation is ready.' };
    case RfqStatus.IN_REVIEW:
      return {
        tone: 'info',
        title: 'Being priced',
        body: `${rfq.assignedTo ? `${rfq.assignedTo.fullName} from Top Flow is` : 'Our sales team is'} preparing your quotation${rfq.quotations.length > 0 ? ' revision' : ''}.`,
      };
    case RfqStatus.QUOTED:
      return { tone: 'success', title: 'Your quotation is ready', body: 'Review the latest quotation below, then accept it, request changes or reject it.' };
    case RfqStatus.CANCELLED:
      return { tone: 'warning', title: 'This RFQ was cancelled', body: 'Nothing further will be quoted. Submit a new RFQ from your cart if you still need these items.' };
    default:
      return null;
  }
}

function quotationAction(quotation: QuotationSummaryDto): { label: string; primary: boolean } {
  if (!isQuotationOpen(quotation.status) || quotation.isExpired) return { label: 'View', primary: false };
  return quotation.status === QuotationStatus.PENDING_APPROVAL ? { label: 'Review approval', primary: true } : { label: 'Review & respond', primary: true };
}

function RfqView({ initial }: { initial: RfqDto }) {
  const { can } = useOrg();
  const [rfq, setRfq] = useState(initial);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cancellable = (rfq.status === RfqStatus.SUBMITTED || rfq.status === RfqStatus.IN_REVIEW) && can(OrgPermission.RFQ_CREATE);
  const guidance = statusGuidance(rfq);

  const cancel = async () => {
    setError(null);
    try {
      setRfq(await api<RfqDto>(`/org/rfqs/${rfq.id}/cancel`, { method: 'POST', org: true }));
      setNotice('RFQ cancelled. Our sales team will stop working on it.');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div>
      <BackLink href="/business/rfqs">All RFQs</BackLink>
      <Suspense fallback={null}>
        <FlagAlert flag="submitted" title="RFQ submitted — our sales team will send you a quotation">
          We&apos;ll email you when it&apos;s ready. You can follow its progress on this page at any time.
        </FlagAlert>
      </Suspense>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-brand-700">Request for quotation</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-2xl font-bold tracking-tight text-ink-900">{rfq.number}</h1>
            <RfqStatusBadge status={rfq.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Submitted {formatDateTime(rfq.createdAt)}
            {rfq.requestedBy && ` by ${rfq.requestedBy.fullName}`}
          </p>
        </div>
        {cancellable && <ConfirmAction label="Cancel RFQ" confirmLabel="Yes, cancel it" prompt="Cancel this request?" onConfirm={cancel} />}
      </div>

      {(notice || error || guidance) && (
        <div className="mb-6 space-y-3">
          {notice && <Alert tone="success">{notice}</Alert>}
          {error && <Alert tone="danger">{error}</Alert>}
          {guidance && !notice && (
            <Alert tone={guidance.tone} title={guidance.title}>
              {guidance.body}
            </Alert>
          )}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Quotations" description={rfq.quotations.length > 1 ? 'Latest revision first' : undefined} />
            {rfq.quotations.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">
                {rfq.status === RfqStatus.CANCELLED
                  ? 'This request was cancelled before it was quoted.'
                  : 'No quotation yet — you will receive an email as soon as it is ready.'}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {rfq.quotations.map((quotation, index) => {
                  const action = quotationAction(quotation);
                  return (
                    <li key={quotation.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/business/quotations/${quotation.id}`} className="font-mono text-sm font-semibold text-brand-700 hover:underline">
                            {quotation.displayNumber}
                          </Link>
                          <QuotationStatusBadge status={quotation.status} expired={quotation.isExpired} />
                          {index === 0 && rfq.quotations.length > 1 && <Badge>Latest</Badge>}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {quotation.isExpired ? 'Expired' : 'Valid until'} {formatDate(quotation.validUntil)}
                        </p>
                      </div>
                      <p className="font-semibold tabular-nums text-ink-900">{aed(quotation.total)}</p>
                      <LinkButton href={`/business/quotations/${quotation.id}`} size="sm" variant={action.primary ? 'primary' : 'secondary'}>
                        {action.label}
                      </LinkButton>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title="Requested items" description={pluralize(rfq.items.length, 'line')} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th scope="col" className="px-5 py-2.5">Product</th>
                    <th scope="col" className="px-5 py-2.5 text-right">Quantity</th>
                    <th scope="col" className="px-5 py-2.5">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rfq.items.map((item) => (
                    <tr key={item.id} className="align-top">
                      <td className="px-5 py-3">
                        <p className="font-medium text-ink-900">{item.productName}</p>
                        <p className="font-mono text-xs text-slate-400">{item.sku}</p>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">{item.quantity.toLocaleString('en-AE')}</td>
                      <td className="px-5 py-3 text-slate-600">{item.notes ?? <span className="text-slate-400">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title="Details" />
          <DetailList>
            <DetailItem stacked label="Project reference">{rfq.projectReference}</DetailItem>
            <DetailItem stacked label="Delivery site">
              <AddressBlock address={rfq.deliveryAddress} fallback={rfq.shippingAddress} />
            </DetailItem>
            <DetailItem stacked label="Required by">{rfq.requiredBy ? formatDate(rfq.requiredBy) : null}</DetailItem>
            <DetailItem stacked label="Requested by">
              {rfq.requestedBy && (
                <>
                  {rfq.requestedBy.fullName}
                  {rfq.requestedBy.email && <span className="block text-slate-500">{rfq.requestedBy.email}</span>}
                </>
              )}
            </DetailItem>
            <DetailItem stacked label="Top Flow contact">{rfq.assignedTo?.fullName ?? <span className="text-slate-500">Not assigned yet</span>}</DetailItem>
            <DetailItem stacked label="Last updated">{formatDateTime(rfq.updatedAt)}</DetailItem>
            {rfq.notes && (
              <DetailItem stacked label="Notes for Top Flow">
                <Prose>{rfq.notes}</Prose>
              </DetailItem>
            )}
          </DetailList>
        </Card>
      </div>
    </div>
  );
}

export default function RfqDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = useApiQuery<RfqDto>(`/org/rfqs/${id}`, { org: true });

  if (error) {
    return (
      <div>
        <BackLink href="/business/rfqs">All RFQs</BackLink>
        <LoadError
          error={error}
          onRetry={reload}
          notFound={{ title: 'RFQ not found', description: 'It may belong to another organization you are a member of.', href: '/business/rfqs', label: 'Back to RFQs' }}
        />
      </div>
    );
  }
  if (!data || data.id !== id) return <LoadingBlock label="Loading RFQ…" />;
  // Keyed so a reload with newer data resets local state; actions update it in place.
  return <RfqView key={`${data.id}:${data.updatedAt}`} initial={data} />;
}
