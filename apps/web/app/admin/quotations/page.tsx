'use client';

import { Permission, QUOTATION_STATUS_LABELS, QuotationStatus, enumValues, hasPermission, type Paginated, type QuotationSummaryDto } from '@topflow/shared';
import Link from 'next/link';
import { Suspense } from 'react';
import { QueryError } from '@/components/admin/detail';
import { FilterBar, SearchBox, pickEnum, useUrlFilters } from '@/components/admin/list-filters';
import { RequireAuth } from '@/components/require-auth';
import { QuotationStatusBadge } from '@/components/status-badge';
import { Button, EmptyState, LinkButton, LoadingBlock, PageHeader, Pagination, Select, Table, Td, Th, cx } from '@/components/ui';
import { aed, formatDate, pluralize } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useApiQuery } from '@/lib/use-api';

const STATUSES = enumValues(QuotationStatus);

function QuotationList() {
  const { user } = useSession();
  const filters = useUrlFilters();
  const status = pickEnum(filters.get('status'), STATUSES);
  const search = filters.get('search');
  const filtered = Boolean(status || search);
  const { data, error, loading, reload } = useApiQuery<Paginated<QuotationSummaryDto>>('/admin/quotations', {
    query: { page: filters.page, status, search },
  });
  const clear = () => filters.update({ status: null, search: null });

  return (
    <>
      <PageHeader
        title="Quotations"
        description="Draft, send and revise trade quotations. New quotations start from an RFQ."
        actions={
          hasPermission(user?.role, Permission.RFQS_MANAGE) ? (
            <LinkButton href="/admin/rfqs" variant="secondary">
              Open RFQs
            </LinkButton>
          ) : undefined
        }
      />

      <FilterBar>
        <SearchBox
          key={search}
          initial={search}
          label="Search quotations"
          placeholder="Quotation number, organization or PO number…"
          onSearch={(value) => filters.update({ search: value })}
        />
        <Select aria-label="Filter by status" value={status} onChange={(event) => filters.update({ status: event.target.value })} className="md:w-56">
          <option value="">All statuses</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {QUOTATION_STATUS_LABELS[value]}
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
        <QueryError error={error} onRetry={reload} title="Could not load quotations" />
      ) : !data ? (
        <LoadingBlock label="Loading quotations…" />
      ) : data.items.length === 0 ? (
        <EmptyState
          title={filtered ? 'No quotations match these filters' : 'No quotations yet'}
          description={filtered ? 'Try a different status or search term.' : 'Open an RFQ and choose “Create quotation” to draft the first one.'}
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
          <p className="mb-2 text-sm text-slate-500">{pluralize(data.total, 'quotation')}</p>
          <Table>
            <thead>
              <tr>
                <Th>Quotation</Th>
                <Th>Organization</Th>
                <Th>Customer</Th>
                <Th>Status</Th>
                <Th className="text-right">Total</Th>
                <Th>Valid until</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((quotation) => (
                <tr key={quotation.id} className="hover:bg-slate-50/70">
                  <Td>
                    <Link href={`/admin/quotations/${quotation.id}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline">
                      {quotation.displayNumber}
                    </Link>
                  </Td>
                  <Td className="font-medium text-ink-900">{quotation.organization?.name ?? <span className="font-normal text-slate-400">—</span>}</Td>
                  <Td>
                    <p className="text-ink-900">{quotation.customer?.fullName ?? '—'}</p>
                    {quotation.customer?.email && <p className="text-xs text-slate-500">{quotation.customer.email}</p>}
                  </Td>
                  <Td>
                    <QuotationStatusBadge status={quotation.status} expired={quotation.isExpired} />
                  </Td>
                  <Td className="whitespace-nowrap text-right font-medium tabular-nums text-ink-900">{aed(quotation.total)}</Td>
                  <Td className={cx('whitespace-nowrap', quotation.isExpired ? 'text-red-700' : 'text-slate-500')}>{formatDate(quotation.validUntil)}</Td>
                  <Td className="whitespace-nowrap text-slate-500">{formatDate(quotation.createdAt)}</Td>
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

export default function AdminQuotationsPage() {
  return (
    <RequireAuth permission={Permission.QUOTATIONS_MANAGE}>
      <Suspense fallback={<LoadingBlock />}>
        <QuotationList />
      </Suspense>
    </RequireAuth>
  );
}
