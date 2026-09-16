'use client';

import { Permission, RFQ_SOURCE_LABELS, RFQ_STATUS_LABELS, RfqSource, RfqStatus, enumValues, type Paginated, type RfqDto } from '@topflow/shared';
import { ClipboardList, SearchX } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { QueryError, RfqSourceBadge } from '@/components/admin/detail';
import { FilterBar, SearchBox, pickEnum, useUrlFilters } from '@/components/admin/list-filters';
import { RequireAuth } from '@/components/require-auth';
import { RfqStatusBadge } from '@/components/status-badge';
import { Button, EmptyState, LoadingBlock, PageHeader, Pagination, Select, Table, Td, Th, cx } from '@/components/ui';
import { formatDate, pluralize } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api';

const STATUSES = enumValues(RfqStatus);
const SOURCES = enumValues(RfqSource);

function isOpen(status: RfqStatus): boolean {
  return status === RfqStatus.SUBMITTED || status === RfqStatus.IN_REVIEW;
}

/**
 * Customer and requester cells. Website requests have no organization or account, so the
 * contact's company (or name) takes the organization's place, with the email underneath.
 */
function CustomerCells({ rfq }: { rfq: RfqDto }) {
  const contact = rfq.source === RfqSource.WEBSITE ? rfq.contact : null;
  if (contact) {
    return (
      <>
        <Td>
          <p className="font-medium text-ink-900">{contact.companyName || contact.name || '—'}</p>
          <p className="text-xs text-slate-500">{contact.email}</p>
        </Td>
        <Td>
          <p className="text-ink-900">{contact.name || '—'}</p>
          {contact.phone && <p className="text-xs whitespace-nowrap text-slate-500">{contact.phone}</p>}
        </Td>
      </>
    );
  }
  return (
    <>
      <Td className="font-medium text-ink-900">{rfq.organization?.name ?? '—'}</Td>
      <Td>
        <p className="text-ink-900">{rfq.requestedBy?.fullName ?? '—'}</p>
        {rfq.requestedBy?.email && <p className="text-xs text-slate-500">{rfq.requestedBy.email}</p>}
      </Td>
    </>
  );
}

function RfqList() {
  const filters = useUrlFilters();
  const status = pickEnum(filters.get('status'), STATUSES);
  const source = pickEnum(filters.get('source'), SOURCES);
  const search = filters.get('search');
  const filtered = Boolean(status || source || search);
  const { data, error, loading, reload } = useApiQuery<Paginated<RfqDto>>('/admin/rfqs', {
    query: { page: filters.page, status, source, search },
  });
  const clear = () => filters.update({ status: null, source: null, search: null });

  return (
    <>
      <PageHeader title="Requests for quotation" description="Trade portal RFQs and website quote requests — assign an owner, then quote or reply." />

      <FilterBar>
        <SearchBox
          key={search}
          initial={search}
          label="Search RFQs"
          placeholder="RFQ number, project, organization or contact…"
          onSearch={(value) => filters.update({ search: value })}
        />
        <Select aria-label="Filter by source" value={source} onChange={(event) => filters.update({ source: event.target.value })} className="md:w-44">
          <option value="">All sources</option>
          {SOURCES.map((value) => (
            <option key={value} value={value}>
              {RFQ_SOURCE_LABELS[value]}
            </option>
          ))}
        </Select>
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
          description={
            filtered
              ? 'Try a different source, status or search term.'
              : 'Requests from trade customers’ carts and quote requests from the website appear here.'
          }
          icon={filtered ? <SearchX aria-hidden="true" /> : <ClipboardList aria-hidden="true" />}
          action={
            filtered ? (
              <Button variant="secondary" onClick={clear}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className={cx('motion-safe:transition-opacity', loading && 'opacity-60')} aria-busy={loading}>
          <p className="mb-2 text-sm text-slate-500">{pluralize(data.total, 'request')}</p>
          <Table>
            <thead>
              <tr>
                <Th>RFQ</Th>
                <Th>Source</Th>
                <Th>Customer</Th>
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
                  <Td className="whitespace-nowrap">
                    <RfqSourceBadge source={rfq.source} />
                  </Td>
                  <CustomerCells rfq={rfq} />
                  <Td className="text-slate-700">{rfq.projectReference ?? <span className="text-slate-500">—</span>}</Td>
                  <Td>
                    <RfqStatusBadge status={rfq.status} />
                  </Td>
                  <Td>
                    {rfq.assignedTo ? (
                      <span className="text-ink-900">{rfq.assignedTo.fullName}</span>
                    ) : isOpen(rfq.status) ? (
                      <span className="font-medium text-warning-700">Unassigned</span>
                    ) : (
                      <span className="text-slate-500">—</span>
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
