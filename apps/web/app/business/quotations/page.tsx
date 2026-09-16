'use client';

import {
  QUOTATION_STATUS_LABELS,
  QuotationStatus,
  enumValues,
  isQuotationOpen,
  type Paginated,
  type QuotationSummaryDto,
} from '@topflow/shared';
import { FileText, SearchX } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { LoadError } from '@/components/business/feedback';
import { ListToolbar, useListParams } from '@/components/business/list-controls';
import { QuotationStatusBadge } from '@/components/status-badge';
import { Button, EmptyState, LinkButton, LoadingBlock, PageHeader, Pagination, Table, Td, Th, cx } from '@/components/ui';
import { aed, formatDate, pluralize } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api';

/** Drafts are internal to Top Flow and never visible to customers. */
const STATUSES = enumValues(QuotationStatus).filter((status) => status !== QuotationStatus.DRAFT);

function QuotationList() {
  const list = useListParams(STATUSES);
  const { data, error, loading, reload } = useApiQuery<Paginated<QuotationSummaryDto>>('/org/quotations', { org: true, query: list.query });

  return (
    <>
      <PageHeader
        title="Quotations"
        description={data ? `${pluralize(data.total, 'quotation')}${list.filtered ? ' match your filters' : ''}` : 'Priced offers from Top Flow for your RFQs.'}
      />
      <ListToolbar
        statuses={STATUSES}
        labels={QUOTATION_STATUS_LABELS}
        status={list.status}
        search={list.search}
        searchPlaceholder="Search by quotation or PO number"
        onChange={list.update}
      />

      {error ? (
        <LoadError error={error} onRetry={reload} />
      ) : !data ? (
        <LoadingBlock label="Loading quotations…" />
      ) : data.items.length === 0 ? (
        list.filtered ? (
          <EmptyState
            icon={<SearchX aria-hidden="true" />}
            title="No quotations match your filters"
            description="Try another status or search term."
            action={
              <Button variant="secondary" onClick={() => list.update({ status: null, search: '' })}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<FileText aria-hidden="true" />}
            title="No quotations yet"
            description="Quotations appear here as soon as our sales team prices one of your RFQs. We'll also email you."
            action={
              <LinkButton href="/business/rfqs" variant="secondary">
                View your RFQs
              </LinkButton>
            }
          />
        )
      ) : (
        <div className={cx('transition-opacity', loading && 'opacity-60')} aria-busy={loading}>
          <Table>
            <thead>
              <tr>
                <Th>Quotation</Th>
                <Th>Status</Th>
                <Th>Contact</Th>
                <Th className="text-right">Total incl. VAT</Th>
                <Th>Valid until</Th>
                <Th>Created</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((quotation) => {
                const actionable = isQuotationOpen(quotation.status) && !quotation.isExpired;
                return (
                  <tr key={quotation.id} className={cx('hover:bg-slate-50', actionable && 'bg-brand-50/40')}>
                    <Td>
                      <Link
                        href={`/business/quotations/${quotation.id}`}
                        className="whitespace-nowrap font-mono text-sm font-semibold text-brand-700 underline-offset-4 hover:underline"
                      >
                        {quotation.displayNumber}
                      </Link>
                    </Td>
                    <Td>
                      <QuotationStatusBadge status={quotation.status} expired={quotation.isExpired} />
                    </Td>
                    <Td className="whitespace-nowrap">{quotation.customer?.fullName ?? '—'}</Td>
                    <Td className="whitespace-nowrap text-right font-medium tabular-nums text-ink-900">{aed(quotation.total)}</Td>
                    <Td className={cx('whitespace-nowrap', quotation.isExpired ? 'text-slate-500 line-through' : 'text-slate-600')}>
                      {formatDate(quotation.validUntil)}
                    </Td>
                    <Td className="whitespace-nowrap text-slate-500">{formatDate(quotation.createdAt)}</Td>
                    <Td className="text-right">
                      {actionable && (
                        <LinkButton href={`/business/quotations/${quotation.id}`} size="sm" variant="secondary">
                          {quotation.status === QuotationStatus.PENDING_APPROVAL ? 'Review approval' : 'Respond'}
                        </LinkButton>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <Pagination page={data.page} totalPages={data.totalPages} onPage={(page) => list.update({ page })} />
        </div>
      )}
    </>
  );
}

export default function QuotationsPage() {
  return (
    <Suspense fallback={<LoadingBlock label="Loading quotations…" />}>
      <QuotationList />
    </Suspense>
  );
}
