'use client';

import { QUOTATION_STATUS_LABELS, QuotationStatus, type Paginated, type QuotationSummaryDto } from '@topflow/shared';
import { FileText, SearchX } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { QuotationStatusBadge } from '@/components/status-badge';
import { Alert, Button, Card, EmptyState, Field, LinkButton, LoadingBlock, PageHeader, Pagination, Select, Table, Td, Th, cx } from '@/components/ui';
import { aed, formatDate, pluralize } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api';

/** Drafts never reach customers, so they are not offered as a filter. */
const STATUS_OPTIONS = Object.entries(QUOTATION_STATUS_LABELS).filter(([value]) => value !== QuotationStatus.DRAFT);

function isQuotationStatus(value: string | null): value is QuotationStatus {
  return value !== null && value !== QuotationStatus.DRAFT && Object.hasOwn(QUOTATION_STATUS_LABELS, value);
}

/** The status filter and page number live in the URL, so refresh and the back button keep the view. */
function QuotationsList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const page = Math.max(1, Math.floor(Number(params.get('page'))) || 1);
  const statusParam = params.get('status');
  const status = isQuotationStatus(statusParam) ? statusParam : '';

  const { data, error, loading, reload } = useApiQuery<Paginated<QuotationSummaryDto>>('/me/quotations', { query: { page, status } });

  const navigate = (patch: Record<string, string | null>, scroll = false) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll });
  };

  const clearFilter = () => navigate({ status: null, page: null });

  return (
    <div className="space-y-4">
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <Field label="Status" htmlFor="quotation-status" className="sm:w-60">
          <Select id="quotation-status" value={status} onChange={(e) => navigate({ status: e.target.value || null, page: null })}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        {status && (
          <Button variant="ghost" onClick={clearFilter}>
            Clear filter
          </Button>
        )}
      </Card>

      {error ? (
        <Alert tone="danger" title="We couldn't load your quotations">
          <p>{error.message}</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={reload}>
            Try again
          </Button>
        </Alert>
      ) : !data ? (
        <LoadingBlock label="Loading your quotations…" />
      ) : data.items.length === 0 ? (
        status || page > 1 ? (
          <EmptyState
            icon={<SearchX aria-hidden="true" />}
            title="No quotations with this status"
            description="Choose another status to see the rest."
            action={
              <Button variant="secondary" onClick={clearFilter}>
                Clear filter
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<FileText aria-hidden="true" />}
            title="No quotations yet"
            description="Ask for a quote from your basket, or describe your project. When Top Flow has priced it, your quotation appears here and you can accept it online."
            action={<LinkButton href="/quote">Request a quote</LinkButton>}
          />
        )
      ) : (
        <div aria-busy={loading} className={cx('transition-opacity', loading && 'opacity-60')}>
          <p className="mb-2 text-sm text-slate-600">{pluralize(data.total, 'quotation')}</p>
          <Table>
            <thead>
              <tr>
                <Th>Quotation</Th>
                <Th>Date</Th>
                <Th>Valid until</Th>
                <Th className="text-right">Total</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((quotation) => (
                <tr key={quotation.id} className="transition-colors hover:bg-slate-50">
                  <Td>
                    <Link href={`/account/quotations/${quotation.id}`} className="font-mono font-medium text-brand-700 underline-offset-4 hover:underline">
                      {quotation.displayNumber}
                    </Link>
                  </Td>
                  <Td className="whitespace-nowrap text-slate-600">{formatDate(quotation.createdAt)}</Td>
                  <Td className="whitespace-nowrap text-slate-600">{formatDate(quotation.validUntil)}</Td>
                  <Td className="whitespace-nowrap text-right font-semibold tabular-nums text-ink-900">{aed(quotation.total)}</Td>
                  <Td>
                    <QuotationStatusBadge status={quotation.status} expired={quotation.isExpired} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={data.page} totalPages={data.totalPages} onPage={(next) => navigate({ page: next > 1 ? String(next) : null }, true)} />
        </div>
      )}
    </div>
  );
}

export default function QuotationsPage() {
  return (
    <div>
      <PageHeader
        title="Quotations"
        description="Prices Top Flow has prepared for you. Accept a quotation to turn it into an order."
        actions={
          <LinkButton href="/quote" variant="secondary">
            Request a quote
          </LinkButton>
        }
      />
      <Suspense fallback={<LoadingBlock label="Loading your quotations…" />}>
        <QuotationsList />
      </Suspense>
    </div>
  );
}
