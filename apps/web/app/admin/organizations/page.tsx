'use client';

import {
  ORG_STATUS_LABELS,
  ORG_TYPE_LABELS,
  OrgStatus,
  PAYMENT_TERMS_LABELS,
  Permission,
  type OrganizationDto,
  type Paginated,
} from '@topflow/shared';
import Link from 'next/link';
import { Suspense } from 'react';
import { RequirePermission } from '@/components/admin-catalog/access';
import { formatPercent } from '@/components/admin-catalog/helpers';
import { FilterTabs, LoadError, ResultSummary, SearchForm } from '@/components/admin-catalog/list-controls';
import { useQueryState } from '@/components/admin-catalog/query-state';
import { OrgStatusBadge } from '@/components/status-badge';
import { Button, EmptyState, LoadingBlock, PageHeader, Pagination, Table, Td, Th } from '@/components/ui';
import { aed, formatDate } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api';

type StatusFilter = OrgStatus | 'ALL';

const STATUS_VALUES: readonly string[] = Object.values(OrgStatus);

function Muted({ children }: { children?: string | null }) {
  return children ? <>{children}</> : <span className="text-slate-400">—</span>;
}

function OrganizationsList() {
  const { get, page, update } = useQueryState();
  const statusParam = get('status');
  const status: StatusFilter = STATUS_VALUES.includes(statusParam) ? (statusParam as OrgStatus) : 'ALL';
  const search = get('search');

  const { data, error, loading, reload } = useApiQuery<Paginated<OrganizationDto>>('/admin/organizations', {
    query: { page, status: status === 'ALL' ? undefined : status, search },
  });
  // Only the total is needed, to badge the "Pending verification" tab.
  const pending = useApiQuery<Paginated<OrganizationDto>>('/admin/organizations', {
    query: { status: OrgStatus.PENDING_VERIFICATION, pageSize: 1 },
  });

  const filtered = status !== 'ALL' || search !== '';
  const clearFilters = () => update({ status: null, search: null });

  const tabs: Array<{ value: StatusFilter; label: string; count?: number }> = [
    { value: 'ALL', label: 'All' },
    { value: OrgStatus.PENDING_VERIFICATION, label: ORG_STATUS_LABELS.PENDING_VERIFICATION, count: pending.data?.total },
    { value: OrgStatus.ACTIVE, label: ORG_STATUS_LABELS.ACTIVE },
    { value: OrgStatus.SUSPENDED, label: ORG_STATUS_LABELS.SUSPENDED },
  ];

  let content;
  if (!data) {
    content = error ? null : <LoadingBlock label="Loading organizations…" />;
  } else if (data.items.length === 0 && data.total > 0) {
    content = (
      <EmptyState
        title="This page is empty"
        description={`There are only ${data.totalPages} page${data.totalPages === 1 ? '' : 's'} of results.`}
        action={
          <Button variant="secondary" onClick={() => update({ page: 1 })}>
            Go to the first page
          </Button>
        }
      />
    );
  } else if (data.items.length === 0) {
    content = filtered ? (
      <EmptyState
        title="No organizations match these filters"
        description="Try another name, TRN or trade licence number, or a different status."
        action={
          <Button variant="secondary" onClick={clearFilters}>
            Clear filters
          </Button>
        }
      />
    ) : (
      <EmptyState title="No trade accounts yet" description="Organizations appear here as soon as a business applies for a trade account." />
    );
  } else {
    content = (
      <>
        <ResultSummary page={data.page} pageSize={data.pageSize} total={data.total} singular="organization" loading={loading} />
        <div aria-busy={loading} className={loading ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
          <Table>
            <thead>
              <tr>
                <Th>Organization</Th>
                <Th>Type</Th>
                <Th>Status</Th>
                <Th>TRN</Th>
                <Th>Trade licence</Th>
                <Th>Payment terms</Th>
                <Th className="text-right">Credit limit</Th>
                <Th className="text-right">Discount</Th>
                <Th className="text-right">Members</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((org) => (
                <tr key={org.id} className="transition hover:bg-slate-50/70">
                  <Td className="min-w-48">
                    <Link href={`/admin/organizations/${org.id}`} className="font-medium text-ink-900 hover:text-brand-700 hover:underline">
                      {org.name}
                    </Link>
                    {org.legalName && org.legalName !== org.name && <p className="text-xs text-slate-500">{org.legalName}</p>}
                  </Td>
                  <Td className="whitespace-nowrap text-slate-600">{ORG_TYPE_LABELS[org.type]}</Td>
                  <Td className="whitespace-nowrap">
                    <OrgStatusBadge status={org.status} />
                  </Td>
                  <Td className="font-mono text-xs whitespace-nowrap text-slate-600">
                    <Muted>{org.trn}</Muted>
                  </Td>
                  <Td className="font-mono text-xs whitespace-nowrap text-slate-600">
                    <Muted>{org.tradeLicenseNumber}</Muted>
                  </Td>
                  <Td className="whitespace-nowrap text-slate-600">{PAYMENT_TERMS_LABELS[org.paymentTerms]}</Td>
                  <Td className="text-right whitespace-nowrap tabular-nums">{aed(org.creditLimit)}</Td>
                  <Td className="text-right whitespace-nowrap tabular-nums">{formatPercent(org.discountRate)}</Td>
                  <Td className="text-right tabular-nums">{org.memberCount ?? '—'}</Td>
                  <Td className="whitespace-nowrap text-slate-600">{formatDate(org.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
        <Pagination page={data.page} totalPages={data.totalPages} onPage={(next) => update({ page: next })} />
      </>
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <FilterTabs label="Filter by status" value={status} options={tabs} onChange={(next) => update({ status: next === 'ALL' ? null : next })} />
        <SearchForm
          id="organization-search"
          label="Search organizations"
          placeholder="Search by name, TRN or trade licence"
          value={search}
          onSearch={(value) => update({ search: value })}
          className="w-full xl:max-w-md"
        />
      </div>
      {error && (
        <div className="mb-4">
          <LoadError title="We couldn't load organizations" error={error} onRetry={reload} />
        </div>
      )}
      {content}
    </>
  );
}

export default function AdminOrganizationsPage() {
  return (
    <RequirePermission permission={Permission.ORGANIZATIONS_REVIEW} area="Organization review">
      <PageHeader
        eyebrow="Customers"
        title="Organizations"
        description="Verify trade account applications (KYC) and agree payment terms, credit limits and trade discounts."
      />
      <Suspense fallback={<LoadingBlock label="Loading organizations…" />}>
        <OrganizationsList />
      </Suspense>
    </RequirePermission>
  );
}
