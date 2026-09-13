'use client';

import {
  OrgStatus,
  Permission,
  QUOTATION_DEFAULT_VALIDITY_DAYS,
  RFQ_STATUS_LABELS,
  RfqStatus,
  createQuotationSchema,
  hasPermission,
  type MemberDto,
  type OrganizationDto,
  type ProductDto,
  type QuotationDto,
  type RfqDto,
} from '@topflow/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { QueryError } from '@/components/admin/detail';
import {
  QuotationLinesCard,
  QuotationSettingsFields,
  QuotationTermsCard,
  QuotationTotalsPreview,
  lineFromProduct,
  linesPayload,
  type EditorLine,
  type QuotationFormValues,
} from '@/components/admin/quotation-line-editor';
import { RequireAuth } from '@/components/require-auth';
import { QuotationStatusBadge, RfqStatusBadge } from '@/components/status-badge';
import { Alert, Button, Card, EmptyState, LinkButton, LoadingBlock, PageHeader } from '@/components/ui';
import { ApiError, api, errorMessage } from '@/lib/api';
import { aed, pluralize } from '@/lib/format';
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from '@/lib/forms';
import { useSession } from '@/lib/session';
import { useApiQuery } from '@/lib/use-api';

type CatalogEntry = ProductDto | 'missing' | 'error';
type Catalog = Record<string, CatalogEntry>;

/** Current catalog prices for the RFQ lines (in small batches so large RFQs stay polite). */
async function loadCatalog(productIds: string[]): Promise<Catalog> {
  const catalog: Catalog = {};
  for (let start = 0; start < productIds.length; start += 8) {
    const batch = productIds.slice(start, start + 8);
    const entries = await Promise.all(
      batch.map((id) =>
        api<ProductDto>(`/catalog/products/${id}`).then(
          (product): CatalogEntry => product,
          (error: unknown): CatalogEntry => (error instanceof ApiError && error.status === 404 ? 'missing' : 'error'),
        ),
      ),
    );
    batch.forEach((id, index) => {
      catalog[id] = entries[index] ?? 'error';
    });
  }
  return catalog;
}

interface SkippedLine {
  sku: string;
  productName: string;
  reason: string;
}

function initialForm(rfq: RfqDto, catalog: Catalog): { values: QuotationFormValues; skipped: SkippedLine[] } {
  const lines: EditorLine[] = [];
  const skipped: SkippedLine[] = [];
  for (const item of rfq.items) {
    const entry = item.productId ? catalog[item.productId] : 'missing';
    if (entry === 'missing') {
      skipped.push({ sku: item.sku, productName: item.productName, reason: 'no longer in the catalog' });
    } else if (entry === 'error' || entry === undefined) {
      skipped.push({ sku: item.sku, productName: item.productName, reason: 'catalog details could not be loaded — add it again below' });
    } else if (!entry.isActive) {
      skipped.push({ sku: item.sku, productName: item.productName, reason: 'archived, so it cannot be quoted' });
    } else {
      lines.push(lineFromProduct(entry, { quantity: item.quantity, note: item.notes }));
    }
  }
  return {
    values: { lines, deliveryFee: '', validityDays: String(QUOTATION_DEFAULT_VALIDITY_DAYS), notes: '', terms: '', internalNotes: '' },
    skipped,
  };
}

function NewQuotationForm({ rfq, catalog, defaultDiscount, notice }: { rfq: RfqDto; catalog: Catalog; defaultDiscount: string | null; notice: string | null }) {
  const router = useRouter();
  const [initial] = useState(() => initialForm(rfq, catalog));
  const [values, setValues] = useState(initial.values);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const create = async () => {
    setError(null);
    const parsed = createQuotationSchema.safeParse({
      quoteRequestId: rfq.id,
      items: linesPayload(values.lines),
      deliveryFee: values.deliveryFee.trim() || undefined,
      validityDays: Number(values.validityDays),
      notes: values.notes,
      terms: values.terms,
      internalNotes: values.internalNotes,
    });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      setError('Please fix the highlighted fields.');
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const quotation = await api<QuotationDto>('/admin/quotations', { method: 'POST', body: parsed.data });
      router.replace(`/admin/quotations/${quotation.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setErrors(apiFieldErrors(err));
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/admin/rfqs/${rfq.id}`} className="hover:underline">
            ← {rfq.number}
          </Link>
        }
        title="New quotation"
        description={
          <>
            For {rfq.organization?.name ?? '—'} · requested by {rfq.requestedBy?.fullName ?? '—'}
            {rfq.projectReference ? ` · ${rfq.projectReference}` : ''}
          </>
        }
        actions={<RfqStatusBadge status={rfq.status} />}
      />

      <div className="mb-6 space-y-3">
        {initial.skipped.length > 0 && (
          <Alert tone="warning" title={`${pluralize(initial.skipped.length, 'requested line')} could not be added`}>
            <ul className="list-disc space-y-0.5 pl-5">
              {initial.skipped.map((line) => (
                <li key={line.sku}>
                  {line.productName} ({line.sku}) — {line.reason}
                </li>
              ))}
            </ul>
          </Alert>
        )}
        {notice && <Alert tone="info">{notice}</Alert>}
        {rfq.notes && (
          <Alert tone="info" title="Notes from the customer">
            <p className="whitespace-pre-line">{rfq.notes}</p>
          </Alert>
        )}
      </div>

      <div className="space-y-6">
        <QuotationLinesCard values={values} onChange={setValues} errors={errors} defaultDiscount={defaultDiscount} disabled={submitting} />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <QuotationTermsCard values={values} onChange={setValues} errors={errors} disabled={submitting} />
          <Card className="h-fit space-y-5 p-5">
            <QuotationSettingsFields values={values} onChange={setValues} errors={errors} disabled={submitting} />
            <div className="border-t border-slate-100 pt-5">
              <QuotationTotalsPreview values={values} defaultDiscount={defaultDiscount} />
            </div>
            {error && <Alert tone="danger">{error}</Alert>}
            <Button className="w-full" size="lg" loading={submitting} onClick={create}>
              Create draft
            </Button>
            <p className="text-center text-xs text-slate-500">Saved as a draft — nothing is sent to the customer yet.</p>
          </Card>
        </div>
      </div>
    </>
  );
}

function NewQuotationFromRfq({ rfqId }: { rfqId: string }) {
  const { user } = useSession();
  const rfq = useApiQuery<RfqDto>(`/admin/rfqs/${rfqId}`);
  const rfqData = rfq.data;
  const [catalog, setCatalog] = useState<{ rfqId: string; entries: Catalog } | null>(null);

  // The organization's negotiated discount makes the preview match what the server applies.
  const organizationId = rfqData?.organization?.id ?? null;
  const canReviewOrganizations = hasPermission(user?.role, Permission.ORGANIZATIONS_REVIEW);
  const organization = useApiQuery<{ organization: OrganizationDto; members: MemberDto[] }>(
    organizationId && canReviewOrganizations ? `/admin/organizations/${organizationId}` : null,
  ).data?.organization;

  useEffect(() => {
    if (!rfqData) return;
    let cancelled = false;
    const productIds = rfqData.items.flatMap((item) => (item.productId ? [item.productId] : []));
    loadCatalog(productIds)
      .catch((): Catalog => ({}))
      .then((entries) => {
        if (!cancelled) setCatalog({ rfqId: rfqData.id, entries });
      });
    return () => {
      cancelled = true;
    };
  }, [rfqData]);

  if (!rfqData) {
    return rfq.error ? (
      <QueryError error={rfq.error} onRetry={rfq.reload} title="Could not load the RFQ" backHref="/admin/rfqs" backLabel="Back to RFQs" />
    ) : (
      <LoadingBlock label="Loading RFQ…" />
    );
  }

  const blocked =
    rfqData.status === RfqStatus.CLOSED || rfqData.status === RfqStatus.CANCELLED
      ? `${rfqData.number} is ${RFQ_STATUS_LABELS[rfqData.status].toLowerCase()} and can no longer be quoted.`
      : rfqData.quotations.length > 0
        ? `${rfqData.number} already has a quotation — edit the draft or issue a revision instead.`
        : null;

  if (blocked) {
    return (
      <>
        <PageHeader
          eyebrow={
            <Link href={`/admin/rfqs/${rfqData.id}`} className="hover:underline">
              ← {rfqData.number}
            </Link>
          }
          title="New quotation"
        />
        <Alert tone="warning" title="This RFQ can’t be quoted again">
          {blocked}
        </Alert>
        {rfqData.quotations.length > 0 && (
          <Card className="mt-4">
            <ul className="divide-y divide-slate-100">
              {rfqData.quotations.map((quotation) => (
                <li key={quotation.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <Link href={`/admin/quotations/${quotation.id}`} className="font-mono text-sm font-semibold text-brand-700 hover:underline">
                    {quotation.displayNumber}
                  </Link>
                  <span className="flex items-center gap-3">
                    <QuotationStatusBadge status={quotation.status} expired={quotation.isExpired} />
                    <span className="font-semibold tabular-nums text-ink-900">{aed(quotation.total)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </>
    );
  }

  if (!catalog || catalog.rfqId !== rfqData.id) return <LoadingBlock label="Looking up catalog prices…" />;

  const defaultDiscount = organization ? (organization.status === OrgStatus.ACTIVE ? organization.discountRate : '0.00') : null;
  const notice =
    organization && organization.status !== OrgStatus.ACTIVE
      ? `${organization.name} is not verified yet, so no default trade discount applies — enter line discounts if needed.`
      : null;

  return <NewQuotationForm key={rfqData.id} rfq={rfqData} catalog={catalog.entries} defaultDiscount={defaultDiscount} notice={notice} />;
}

function NewQuotation() {
  const params = useSearchParams();
  const rfqId = params.get('rfq');
  if (!rfqId) {
    return (
      <>
        <PageHeader title="New quotation" />
        <EmptyState
          title="Start from an RFQ"
          description="Quotations are drafted from a customer’s request for quotation. Open an RFQ and choose “Create quotation”."
          action={<LinkButton href="/admin/rfqs">Browse RFQs</LinkButton>}
        />
      </>
    );
  }
  return <NewQuotationFromRfq key={rfqId} rfqId={rfqId} />;
}

export default function NewQuotationPage() {
  return (
    <RequireAuth permission={Permission.QUOTATIONS_MANAGE}>
      <Suspense fallback={<LoadingBlock />}>
        <NewQuotation />
      </Suspense>
    </RequireAuth>
  );
}
