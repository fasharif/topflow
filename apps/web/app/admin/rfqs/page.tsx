'use client';

import { Permission, RFQ_STATUS_LABELS, RfqStatus, enumValues, type Paginated, type RfqDto } from '@topflow/shared';
import Link from 'next/link';
import { Suspense } from 'react';
import { QueryError } from '@/components/admin/detail';
import { FilterBar, SearchBox, pickEnum, useUrlFilters } from '@/components/admin/list-filters';
import { RequireAuth } from '@/components/require-auth';
import { RfqStatusBadge } from '@/components/status-badge';
import { Button, EmptyState, LoadingBlock, PageHeader, Pagination, Select, Table, Td, Th, cx } from '@/components/ui';
import { formatDate, pluralize } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api';

const STATUSES = enumValues(RfqStatus);

function isOpen(status: RfqStatus): boolean {
  return status === RfqStatus.SUBMITTED || status === RfqStatus.IN_REVIEW;
}

function RfqList() {
  const filters = useUrlFilters();
  const status = pickEnum(filters.get('status'), STATUSES);
  const search = filters.get('search');
  const filtered = Boolean(status || search);
  const { data, error, loading, reload } = useApiQuery<Paginated<RfqDto>>('/admin/rfqs', {
    query: { page: filters.page, status, search },
  });
  const clear = () => filters.update({ status: null, search: null });

  return (
    <>
      <PageHeader title="Requests for quotation" description="Trade customers’ RFQs — assign an owner, then draft and send a quotation." />

      <FilterBar>
        <SearchBox key={search} initial={search} label="Search RFQs" placeholder="RFQ number, project or organization…" onSearch={(value) => filters.update({ search: value })} />
        <Select aria-label="Filter by status" value={status} onChange={(event) => filters.update({ status: event.target.value })} className="md:w-48">
          <option value="">All statuses</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {RFQ_STATUS_LABELS[value]}
            </option>
          ))}
        </Select>
        {filtered && (
          <Button variant="ghost" onClick={clear}>
            Clear
          </Button>
        )}
      </FilterBar>

      {error ? (
        <QueryError error={error} onRetry={reload} title="Could not load RFQs" />
      ) : !data ? (
        <LoadingBlock label="Loading RFQs…" />
      ) : data.items.length === 0 ? (
        <EmptyState
          title={filtered ? 'No RFQs match these filters' : 'No RFQs yet'}
          description={filtered ? 'Try a different status or search term.' : 'Requests submitted by trade customers from their cart appear here.'}
          action={
            filtered ? (
              <Button variant="secondary" onClick={clear}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className={cx('transition-opacity', loading && 'opacity-60')} aria-busy={loading}>
          <p className="mb-2 text-sm text-slate-500">{pluralize(data.total, 'request')}</p>
          <Table>
            <thead>
              <tr>
                <Th>RFQ</Th>
                <Th>Organization</Th>
                <Th>Requested by</Th>
                <Th>Project</Th>
                <Th>Status</Th>
                <Th>Assigned to</Th>
                <Th className="text-right">Lines</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((rfq) => (
                <tr key={rfq.id} className="hover:bg-slate-50/70">
                  <Td>
                    <Link href={`/admin/rfqs/${rfq.id}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline">
                      {rfq.number}
                    </Link>
                    {rfq.requiredBy && <p className="text-xs text-slate-500">Needed by {formatDate(rfq.requiredBy)}</p>}
                  </Td>
                  <Td className="font-medium text-ink-900">{rfq.organization?.name ?? '—'}</Td>
                  <Td>
                    <p className="text-ink-900">{rfq.requestedBy?.fullName ?? '—'}</p>
                    {rfq.requestedBy?.email && <p className="text-xs text-slate-500">{rfq.requestedBy.email}</p>}
                  </Td>
                  <Td className="text-slate-700">{rfq.projectReference ?? <span className="text-slate-400">—</span>}</Td>
                  <Td>
                    <RfqStatusBadge status={rfq.status} />
                  </Td>
                  <Td>
                    {rfq.assignedTo ? (
                      <span className="text-ink-900">{rfq.assignedTo.fullName}</span>
                    ) : isOpen(rfq.status) ? (
                      <span className="font-medium text-amber-700">Unassigned</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">{rfq.items.length}</Td>
                  <Td className="whitespace-nowrap text-slate-500">{formatDate(rfq.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={data.page} totalPages={data.totalPages} onPage={(page) => filters.update({ page })} />
        </div>
      )}
    </>
  );
}

export default function AdminRfqsPage() {
  return (
    <RequireAuth permission={Permission.RFQS_MANAGE}>
      <Suspense fallback={<LoadingBlock />}>
        <RfqList />
      </Suspense>
    </RequireAuth>
  );
}
