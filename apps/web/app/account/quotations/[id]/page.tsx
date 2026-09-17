'use client';

import { QuotationResponse, QuotationStatus, respondPersonalQuotationSchema, type AddressDto, type QuotationDto } from '@topflow/shared';
import { Check, Download } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { DetailItem, DetailList, Prose } from '@/components/business/detail-list';
import { DocumentLines, DocumentTotals } from '@/components/business/document-lines';
import { BackLink, LoadError } from '@/components/business/feedback';
import { QuotationStatusBadge } from '@/components/status-badge';
import { Alert, Button, Card, CardHeader, Field, LinkButton, LoadingBlock, Textarea, buttonClass, cx } from '@/components/ui';
import { api, downloadFile, errorMessage } from '@/lib/api';
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from '@/lib/forms';
import { aed, formatDate, formatDateTime, pluralize } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api';

type OnUpdated = (quotation: QuotationDto, message: string) => void;

const RESPONSE_OPTIONS: Array<{ value: QuotationResponse; label: string }> = [
  { value: QuotationResponse.ACCEPT, label: 'Accept' },
  { value: QuotationResponse.REQUEST_REVISION, label: 'Request changes' },
  { value: QuotationResponse.REJECT, label: 'Reject' },
];

function DownloadPdfButton({ quotation }: { quotation: QuotationDto }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      await downloadFile(`/me/quotations/${quotation.id}/pdf`, {}, `${quotation.displayNumber.replace(/\s+/g, '-')}.pdf`);
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
  if (quotation.orderId) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-success-200 bg-success-50 p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-success-600 text-white">
            <Check aria-hidden="true" className="size-5" />
          </span>
          <div>
            <p className="font-semibold text-success-900">Accepted — order {quotation.orderNumber} created</p>
            <p className="text-sm text-success-800">Accepted on {formatDateTime(quotation.respondedAt)}. You pay on delivery.</p>
          </div>
        </div>
        <LinkButton href={`/account/orders/${quotation.orderId}`}>View order {quotation.orderNumber}</LinkButton>
      </div>
    );
  }

  if (quotation.isExpired) {
    return (
      <Alert tone="warning" title="This quotation has expired">
        It was valid until {formatDate(quotation.validUntil)} and can no longer be accepted. Request a new quote for updated prices.
      </Alert>
    );
  }

  switch (quotation.status) {
    case QuotationStatus.REJECTED:
      return (
        <Alert tone="warning" title={`You rejected this quotation on ${formatDate(quotation.respondedAt)}`}>
          {quotation.responseNote ?? 'No reason was given.'}
        </Alert>
      );
    case QuotationStatus.REVISION_REQUESTED:
      return (
        <Alert tone="info" title="Changes requested">
          Top Flow is preparing an updated quotation. It will appear in your quotations once it is sent.
        </Alert>
      );
    case QuotationStatus.SUPERSEDED:
      return (
        <Alert tone="info" title="Replaced by a newer revision">
          This version is no longer valid. Open your quotations to see the latest one.
        </Alert>
      );
    default:
      return null;
  }
}

function responseMessage(action: QuotationResponse, updated: QuotationDto): string {
  if (action === QuotationResponse.ACCEPT) {
    return `Quotation accepted${updated.orderNumber ? ` — order ${updated.orderNumber} has been created` : ''}.`;
  }
  return action === QuotationResponse.REJECT
    ? 'Quotation rejected. Thank you for letting us know.'
    : 'Changes requested. Top Flow will send you an updated quotation.';
}

/** Accept (choosing a delivery address), request changes or reject a sent quotation. */
function RespondPanel({ quotation, onUpdated }: { quotation: QuotationDto; onUpdated: OnUpdated }) {
  const addresses = useApiQuery<AddressDto[]>('/me/addresses');
  const [action, setAction] = useState<QuotationResponse>(QuotationResponse.ACCEPT);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const accepting = action === QuotationResponse.ACCEPT;
  const list = addresses.data ?? [];
  // Until the customer picks one, the default address (or the first) is selected.
  const selectedId = addressId ?? list.find((address) => address.isDefault)?.id ?? list[0]?.id ?? null;

  const choose = (next: QuotationResponse) => {
    setAction(next);
    setErrors({});
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const parsed = respondPersonalQuotationSchema.safeParse({
      action,
      addressId: accepting ? (selectedId ?? undefined) : undefined,
      note,
    });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const updated = await api<QuotationDto>(`/me/quotations/${quotation.id}/respond`, { method: 'POST', body: parsed.data });
      onUpdated(updated, responseMessage(action, updated));
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
                <span className="text-slate-600">Pay on delivery</span>
                <span className="text-lg font-semibold tabular-nums text-ink-900">{aed(quotation.total)}</span>
              </div>
              <p className="mt-0.5 text-right text-xs text-slate-600">incl. VAT and delivery</p>
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-medium text-ink-900">Deliver to</legend>
              {addresses.error ? (
                <Alert tone="danger" title="We couldn't load your addresses">
                  <Button variant="secondary" size="sm" className="mt-2" onClick={addresses.reload}>
                    Try again
                  </Button>
                </Alert>
              ) : !addresses.data ? (
                <LoadingBlock label="Loading your addresses…" />
              ) : list.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
                  <p>Add a delivery address to accept this quotation.</p>
                  <LinkButton href="/account/addresses" variant="secondary" size="sm" className="mt-3">
                    Add an address
                  </LinkButton>
                </div>
              ) : (
                <div className="space-y-2">
                  {list.map((address) => (
                    <label
                      key={address.id}
                      className={cx(
                        'flex cursor-pointer items-start gap-3 rounded-lg border bg-white p-3 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-flow-600',
                        selectedId === address.id ? 'border-brand-600 ring-1 ring-brand-600' : 'border-slate-200 hover:border-slate-400',
                      )}
                    >
                      <input
                        type="radio"
                        name="delivery-address"
                        value={address.id}
                        checked={selectedId === address.id}
                        onChange={() => setAddressId(address.id)}
                        className="mt-0.5 size-4 accent-brand-700"
                      />
                      <span className="min-w-0">
                        <span className="block font-medium text-ink-900">{address.label}</span>
                        <span className="block text-slate-600">{[address.line1, address.line2, address.area, address.city].filter(Boolean).join(', ')}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {errors.addressId && (
                <p role="alert" className="mt-2 text-sm text-danger-700">
                  {errors.addressId}
                </p>
              )}
            </fieldset>

            <Field label="Note" htmlFor="response-note" error={errors.note} optional>
              <Textarea id="response-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} aria-invalid={Boolean(errors.note)} />
            </Field>
          </>
        ) : (
          <Field
            label={action === QuotationResponse.REJECT ? 'Reason for rejecting' : 'What should we change?'}
            htmlFor="response-note"
            error={errors.note}
            hint={action === QuotationResponse.REJECT ? 'Required. Rejecting closes your request.' : 'Required — for example quantities, products or delivery.'}
          >
            <Textarea id="response-note" rows={4} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} aria-invalid={Boolean(errors.note)} />
          </Field>
        )}

        {error && <Alert tone="danger">{error}</Alert>}

        {accepting ? (
          <>
            <Button type="submit" size="lg" className="w-full" loading={submitting} disabled={list.length === 0}>
              Accept quotation
            </Button>
            <p className="text-center text-xs text-slate-600">Accepting places an order at these prices. You pay on delivery.</p>
          </>
        ) : action === QuotationResponse.REJECT ? (
          <Button type="submit" variant="danger" size="lg" className="w-full" loading={submitting}>
            Reject quotation
          </Button>
        ) : (
          <Button type="submit" variant="dark" size="lg" className="w-full" loading={submitting}>
            Request changes
          </Button>
        )}
      </form>
    </Card>
  );
}

function responseLabel(status: QuotationStatus): string {
  switch (status) {
    case QuotationStatus.ACCEPTED:
      return 'Accepted';
    case QuotationStatus.REJECTED:
      return 'Rejected';
    default:
      return 'Changes requested';
  }
}

function ResponseCard({ quotation }: { quotation: QuotationDto }) {
  if (!quotation.respondedAt) return null;
  return (
    <Card>
      <CardHeader title="Your response" />
      <DetailList>
        <DetailItem stacked label={responseLabel(quotation.status)}>
          {formatDateTime(quotation.respondedAt)}
        </DetailItem>
        {quotation.responseNote && (
          <DetailItem stacked label="Note">
            <Prose>{quotation.responseNote}</Prose>
          </DetailItem>
        )}
      </DetailList>
    </Card>
  );
}

function QuotationView({ initial }: { initial: QuotationDto }) {
  const [quotation, setQuotation] = useState(initial);
  const [notice, setNotice] = useState<string | null>(null);
  const canRespond = quotation.status === QuotationStatus.SENT && !quotation.isExpired;

  const onUpdated: OnUpdated = (updated, message) => {
    setQuotation(updated);
    setNotice(message);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div>
      <BackLink href="/account/quotations">All quotations</BackLink>

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
                {' · for your request '}
                <span className="font-mono">{quotation.quoteRequest.number}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {canRespond && (
            <a href="#decision" className={buttonClass('primary', 'md', 'xl:hidden')}>
              Respond
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
          {canRespond && (
            <div id="decision">
              <RespondPanel quotation={quotation} onUpdated={onUpdated} />
            </div>
          )}

          <ResponseCard quotation={quotation} />

          <Card>
            <CardHeader title="Details" />
            <DetailList>
              <DetailItem stacked label="Prepared for">
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
            </DetailList>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function AccountQuotationPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = useApiQuery<QuotationDto>(`/me/quotations/${id}`);

  if (error) {
    return (
      <div>
        <BackLink href="/account/quotations">All quotations</BackLink>
        <LoadError
          error={error}
          onRetry={reload}
          notFound={{
            title: 'Quotation not found',
            description: 'It may have been sent to one of your business accounts — see the trade portal — or it has not been issued yet.',
            href: '/account/quotations',
            label: 'Back to quotations',
          }}
        />
      </div>
    );
  }
  if (!data || data.id !== id) return <LoadingBlock label="Loading quotation…" />;
  return <QuotationView key={`${data.id}:${data.updatedAt}`} initial={data} />;
}
