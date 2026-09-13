'use client';

import { Permission, type AuditLogDto, type Paginated } from '@topflow/shared';
import Link from 'next/link';
import { Fragment, Suspense, useState, type FormEvent } from 'react';
import { RequirePermission } from '@/components/admin-catalog/access';
import { LoadError, ResultSummary } from '@/components/admin-catalog/list-controls';
import { useQueryState } from '@/components/admin-catalog/query-state';
import { Badge, Button, Card, EmptyState, Field, Input, LoadingBlock, PageHeader, Pagination, Select, Table, Td, Th, cx } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api';

const ENTITY_LABELS = {
  User: 'User',
  Organization: 'Organization',
  OrganizationMember: 'Organization member',
  OrganizationInvitation: 'Organization invitation',
  Product: 'Product',
  Category: 'Category',
  QuoteRequest: 'Quote request (RFQ)',
  Quotation: 'Quotation',
  Order: 'Order',
} as const;

/** Bounded-context prefixes used by the API's audit action names (e.g. "orders.status_changed"). */
const ACTION_PREFIXES = ['auth.', 'users.', 'organizations.', 'catalog.', 'procurement.', 'orders.'];

const COLUMNS = 6;

function entityHref(entityType: string, entityId: string): string | null {
  switch (entityType) {
    case 'Organization':
      return `/admin/organizations/${entityId}`;
    case 'Product':
      return `/admin/products/${entityId}/edit`;
    case 'Order':
      return `/admin/orders/${entityId}`;
    case 'Category':
      return '/admin/categories';
    default:
      return null;
  }
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

interface Filters {
  entityType: string;
  entityId: string;
  action: string;
}

/** Uncontrolled filter form, keyed by the applied filters so it resets when the URL changes. */
function AuditFilters({ filters, onApply }: { filters: Filters; onApply: (filters: Filters) => void }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onApply({
      entityType: String(form.get('entityType') ?? ''),
      entityId: String(form.get('entityId') ?? '').trim(),
      action: String(form.get('action') ?? '').trim(),
    });
  };
  const active = Boolean(filters.entityType || filters.entityId || filters.action);

  return (
    <Card className="mb-4 p-4">
      <form
        key={`${filters.entityType}|${filters.entityId}|${filters.action}`}
        onSubmit={submit}
        className="grid gap-3 md:grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))_auto] xl:items-end"
      >
        <Field label="Entity type" htmlFor="audit-entity-type">
          <Select id="audit-entity-type" name="entityType" defaultValue={filters.entityType} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
            <option value="">All entity types</option>
            {Object.entries(ENTITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Action starts with" htmlFor="audit-action">
          <Input id="audit-action" name="action" defaultValue={filters.action} maxLength={80} placeholder="e.g. orders." list="audit-action-prefixes" autoComplete="off" className="font-mono" />
        </Field>
        <datalist id="audit-action-prefixes">
          {ACTION_PREFIXES.map((prefix) => (
            <option key={prefix} value={prefix} />
          ))}
        </datalist>
        <Field label="Entity ID" htmlFor="audit-entity-id">
          <Input id="audit-entity-id" name="entityId" defaultValue={filters.entityId} maxLength={60} placeholder="Exact record id" autoComplete="off" className="font-mono" />
        </Field>
        <div className="flex gap-2">
          <Button type="submit">Apply</Button>
          {active && (
            <Button variant="ghost" onClick={() => onApply({ entityType: '', entityId: '', action: '' })}>
              Clear
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}

function AuditLog() {
  const { get, page, update } = useQueryState();
  const filters: Filters = { entityType: get('entityType'), entityId: get('entityId'), action: get('action') };
  const userId = get('userId');

  const { data, error, loading, reload } = useApiQuery<Paginated<AuditLogDto>>('/admin/audit-logs', {
    query: { page, ...filters, userId },
  });
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const filtered = Boolean(filters.entityType || filters.entityId || filters.action || userId);
  const userName = userId ? data?.items.find((log) => log.user?.id === userId)?.user?.fullName : undefined;

  let content;
  if (!data) {
    content = error ? null : <LoadingBlock label="Loading audit trail…" />;
  } else if (data.items.length === 0) {
    content = (
      <EmptyState
        title={data.total > 0 ? 'This page is empty' : filtered ? 'No audit entries match these filters' : 'No audit entries yet'}
        description={filtered ? 'Action filters match the start of the action name, e.g. "catalog." or "orders.status".' : undefined}
        action={
          filtered || data.total > 0 ? (
            <Button variant="secondary" onClick={() => update({ entityType: null, entityId: null, action: null, userId: null })}>
              {data.total > 0 ? 'Back to the first page' : 'Clear filters'}
            </Button>
          ) : undefined
        }
      />
    );
  } else {
    content = (
      <>
        <ResultSummary page={data.page} pageSize={data.pageSize} total={data.total} singular="entry" plural="entries" loading={loading} />
        <div aria-busy={loading} className={loading ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
          <Table>
            <thead>
              <tr>
                <Th>Time</Th>
                <Th>Action</Th>
                <Th>Entity</Th>
                <Th>User</Th>
                <Th>IP address</Th>
                <Th className="text-right">
                  <span className="sr-only">Details</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((log) => {
                const open = expanded.has(log.id);
                const href = log.entityId ? entityHref(log.entityType, log.entityId) : null;
                const detailsId = `audit-details-${log.id}`;
                return (
                  <Fragment key={log.id}>
                    <tr className={cx('align-top transition', open ? 'bg-slate-50/80' : 'hover:bg-slate-50/70')}>
                      <Td className="whitespace-nowrap text-slate-600 tabular-nums">{formatDateTime(log.createdAt)}</Td>
                      <Td>
                        <code className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs whitespace-nowrap text-ink-900 ring-1 ring-slate-200 ring-inset">
                          {log.action}
                        </code>
                      </Td>
                      <Td className="min-w-44">
                        <div className="text-ink-900">{log.entityType}</div>
                        {log.entityId && (
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
                            {href ? (
                              <Link href={href} title={log.entityId} className="font-mono text-brand-700 hover:underline">
                                {shortId(log.entityId)}
                              </Link>
                            ) : (
                              <span title={log.entityId} className="font-mono text-slate-500">
                                {shortId(log.entityId)}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => update({ entityType: log.entityType, entityId: log.entityId, action: null, userId: null })}
                              className="text-slate-500 hover:text-brand-700 hover:underline"
                            >
                              History<span className="sr-only"> of this {log.entityType}</span>
                            </button>
                          </div>
                        )}
                      </Td>
                      <Td className="min-w-44">
                        {log.user ? (
                          <>
                            <button
                              type="button"
                              onClick={() => update({ userId: log.user?.id })}
                              className="text-left text-ink-900 hover:text-brand-700 hover:underline"
                              title="Show this user's activity"
                            >
                              {log.user.fullName}
                            </button>
                            {log.user.email && <div className="text-xs break-all text-slate-500">{log.user.email}</div>}
                          </>
                        ) : (
                          <Badge>System</Badge>
                        )}
                      </Td>
                      <Td className="font-mono text-xs whitespace-nowrap text-slate-600">{log.ipAddress ?? <span className="text-slate-400">—</span>}</Td>
                      <Td className="text-right whitespace-nowrap">
                        {log.details === null || log.details === undefined ? (
                          <span className="text-xs text-slate-400">No details</span>
                        ) : (
                          <Button variant="ghost" size="sm" aria-expanded={open} aria-controls={detailsId} onClick={() => toggle(log.id)}>
                            {open ? 'Hide details' : 'Details'}
                          </Button>
                        )}
                      </Td>
                    </tr>
                    {open && (
                      <tr id={detailsId}>
                        <Td colSpan={COLUMNS} className="bg-slate-50/80">
                          <pre className="max-h-80 overflow-auto rounded-lg bg-ink-950 p-4 font-mono text-xs leading-relaxed text-slate-100">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </Td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </Table>
        </div>
        <Pagination page={data.page} totalPages={data.totalPages} onPage={(next) => update({ page: next })} />
      </>
    );
  }

  return (
    <>
      <AuditFilters filters={filters} onApply={(next) => update({ ...next, userId: userId || null })} />
      <div className="space-y-4">
        {userId && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <Badge tone="brand">Showing activity by {userName ?? 'one user'}</Badge>
            <Button variant="ghost" size="sm" onClick={() => update({ userId: null })}>
              Show everyone
            </Button>
          </div>
        )}
        {error && <LoadError title="We couldn't load the audit trail" error={error} onRetry={reload} />}
      </div>
      <div className={cx((userId || error) && 'mt-4')}>{content}</div>
    </>
  );
}

export default function AdminAuditPage() {
  return (
    <RequirePermission permission={Permission.AUDIT_READ} area="The audit trail">
      <PageHeader
        eyebrow="Administration"
        title="Audit trail"
        description="Sign-ins, account and KYC decisions, catalog, stock, quotation and order changes: who did what, when and from where. Newest first."
      />
      <Suspense fallback={<LoadingBlock label="Loading audit trail…" />}>
        <AuditLog />
      </Suspense>
    </RequirePermission>
  );
}
