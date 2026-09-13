'use client';

import { RFQ_STATUS_LABELS, RfqStatus, enumValues, type Paginated, type RfqDto } from '@topflow/shared';
import Link from 'next/link';
import { Suspense } from 'react';
import { LoadError } from '@/components/business/feedback';
import { ListToolbar, useListParams } from '@/components/business/list-controls';
import { QuotationStatusBadge, RfqStatusBadge } from '@/components/status-badge';
import { Button, EmptyState, LinkButton, LoadingBlock, PageHeader, Pagination, Table, Td, Th, cx } from '@/components/ui';
import { formatDate, pluralize } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api';

const STATUSES = enumValues(RfqStatus);

function RfqList() {
  const list = useListParams(STATUSES);
  const { data, error, loading, reload } = useApiQuery<Paginated<RfqDto>>('/org/rfqs', { org: true, query: list.query });

  return (
    <>
      <PageHeader
        title="Requests for quotation"
        description={data ? `${pluralize(data.total, 'request')}${list.filtered ? ' match your filters' : ''}` : 'Everything you have asked Top Flow to price.'}
        actions={<LinkButton href="/products">Start a new RFQ</LinkButton>}
      />
      <ListToolbar
        statuses={STATUSES}
        labels={RFQ_STATUS_LABELS}
        status={list.status}
        search={list.search}
        searchPlaceholder="Search by RFQ number or project"
        onChange={list.update}
      />

      {error ? (
        <LoadError error={error} onRetry={reload} />
      ) : !data ? (
        <LoadingBlock label="Loading RFQs…" />
      ) : data.items.length === 0 ? (
        list.filtered ? (
          <EmptyState
            title="No RFQs match your filters"
            description="Try another status or search term."
            action={
              <Button variant="secondary" onClick={() => list.update({ status: null, search: '' })}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="No RFQs yet"
            description="Add products to your cart and choose “Request a trade quotation” to get negotiated pricing for your project."
            action={<LinkButton href="/products">Browse products</LinkButton>}
          />
        )
      ) : (
        <div className={cx('transition-opacity', loading && 'opacity-60')} aria-busy={loading}>
          <Table>
            <thead>
              <tr>
                <Th>RFQ</Th>
                <Th>Project</Th>
                <Th>Status</Th>
                <Th className="text-right">Items</Th>
                <Th>Requested by</Th>
                <Th>Latest quotation</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((rfq) => {
                const latest = rfq.quotations[0];
                return (
                  <tr key={rfq.id} className="hover:bg-slate-50/70">
                    <Td>
                      <Link href={`/business/rfqs/${rfq.id}`} className="whitespace-nowrap font-mono text-xs font-semibold text-brand-700 hover:underline">
                        {rfq.number}
                      </Link>
                    </Td>
                    <Td className="max-w-56 truncate">{rfq.projectReference ?? <span className="text-slate-400">—</span>}</Td>
                    <Td>
                      <RfqStatusBadge status={rfq.status} />
                    </Td>
                    <Td className="text-right tabular-nums">{rfq.items.length}</Td>
                    <Td className="whitespace-nowrap">{rfq.requestedBy?.fullName ?? '—'}</Td>
                    <Td>
                      {latest ? (
                        <Link href={`/business/quotations/${latest.id}`} className="group inline-flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-ink-900 group-hover:underline">{latest.displayNumber}</span>
                          <QuotationStatusBadge status={latest.status} expired={latest.isExpired} />
                        </Link>
                      ) : (
                        <span className="text-slate-400">Not quoted yet</span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-slate-500">{formatDate(rfq.createdAt)}</Td>
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

export default function RfqsPage() {
  return (
    <Suspense fallback={<LoadingBlock label="Loading RFQs…" />}>
      <RfqList />
    </Suspense>
  );
}
