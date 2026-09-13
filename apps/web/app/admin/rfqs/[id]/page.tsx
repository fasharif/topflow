'use client';

import { Permission, RFQ_TRANSITIONS, RfqStatus, hasPermission, updateRfqSchema, type RfqDto, type UpdateRfqInput } from '@topflow/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { AddressBlock, DetailList, QueryError, SectionLabel } from '@/components/admin/detail';
import { RequireAuth } from '@/components/require-auth';
import { QuotationStatusBadge, RfqStatusBadge } from '@/components/status-badge';
import { Alert, Button, Card, CardHeader, EmptyState, LinkButton, LoadingBlock, PageHeader, Table, Td, Th } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { aed, formatDate, formatDateTime, pluralize } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useApiQuery } from '@/lib/use-api';

const STATUS_ACTIONS: Array<{ status: RfqStatus; label: string; confirm: string }> = [
  { status: RfqStatus.CLOSED, label: 'Close RFQ', confirm: 'Close this RFQ? No new quotations can be created for it, and this cannot be undone.' },
  { status: RfqStatus.CANCELLED, label: 'Cancel RFQ', confirm: 'Cancel this RFQ? This cannot be undone.' },
];

function RfqDetail({ id }: { id: string }) {
  const { user } = useSession();
  const query = useApiQuery<RfqDto>(`/admin/rfqs/${id}`);
  const [updated, setUpdated] = useState<RfqDto | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rfq = updated ?? query.data;

  if (!rfq) {
    return query.error ? (
      <QueryError error={query.error} onRetry={query.reload} title="Could not load this RFQ" backHref="/admin/rfqs" backLabel="Back to RFQs" />
    ) : (
      <LoadingBlock label="Loading RFQ…" />
    );
  }

  const canQuote = hasPermission(user?.role, Permission.QUOTATIONS_MANAGE);
  const canReviewOrganizations = hasPermission(user?.role, Permission.ORGANIZATIONS_REVIEW);
  const terminal = RFQ_TRANSITIONS[rfq.status].length === 0;
  const open = rfq.status === RfqStatus.SUBMITTED || rfq.status === RfqStatus.IN_REVIEW;
  const assignedToMe = Boolean(user && rfq.assignedTo?.id === user.id);
  const statusActions = STATUS_ACTIONS.filter((action) => RFQ_TRANSITIONS[rfq.status].includes(action.status));
  const createHref = `/admin/quotations/new?rfq=${rfq.id}`;

  const update = async (key: string, input: UpdateRfqInput) => {
    const parsed = updateRfqSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid update');
      return;
    }
    setBusy(key);
    setError(null);
    try {
      setUpdated(await api<RfqDto>(`/admin/rfqs/${rfq.id}`, { method: 'PATCH', body: parsed.data }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/admin/rfqs" className="hover:underline">
            ← RFQs
          </Link>
        }
        title={rfq.number}
        description={
          <>
            {rfq.organization?.name ?? 'Unknown organization'} · submitted {formatDateTime(rfq.createdAt)}
          </>
        }
        actions={<RfqStatusBadge status={rfq.status} />}
      />

      {error && (
        <div className="mb-6">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6 xl:order-last">
          <Card>
            <CardHeader title="Triage" />
            <div className="space-y-5 p-5">
              <div>
                <SectionLabel>Sales owner</SectionLabel>
                {rfq.assignedTo ? (
                  <p className="text-sm font-medium text-ink-900">
                    {rfq.assignedTo.fullName}
                    {assignedToMe && <span className="font-normal text-slate-500"> (you)</span>}
                  </p>
                ) : (
                  <p className="text-sm font-medium text-amber-700">Unassigned</p>
                )}
                {user && !assignedToMe && !terminal && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-3"
                    loading={busy === 'assign'}
                    disabled={busy !== null}
                    onClick={() => void update('assign', { assignedToId: user.id })}
                  >
                    Assign to me
                  </Button>
                )}
              </div>
              {statusActions.length > 0 && (
                <div>
                  <SectionLabel>Status</SectionLabel>
                  <div className="flex flex-wrap gap-2">
                    {statusActions.map((action) => (
                      <Button
                        key={action.status}
                        variant="secondary"
                        size="sm"
                        loading={busy === action.status}
                        disabled={busy !== null}
                        onClick={() => {
                          if (window.confirm(action.confirm)) void update(action.status, { status: action.status });
                        }}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              {terminal && <p className="text-sm text-slate-500">This request is closed.</p>}
            </div>
          </Card>

          <Card>
            <CardHeader title="Details" />
            <div className="space-y-5 p-5">
              <DetailList
                items={[
                  {
                    label: 'Organization',
                    value:
                      rfq.organization && canReviewOrganizations ? (
                        <Link href={`/admin/organizations/${rfq.organization.id}`} className="text-brand-700 hover:underline">
                          {rfq.organization.name}
                        </Link>
                      ) : (
                        rfq.organization?.name
                      ),
                  },
                  {
                    label: 'Requested by',
                    value: rfq.requestedBy ? (
                      <>
                        <span className="block">{rfq.requestedBy.fullName}</span>
                        {rfq.requestedBy.email && (
                          <a href={`mailto:${rfq.requestedBy.email}`} className="text-xs font-normal text-brand-700 hover:underline">
                            {rfq.requestedBy.email}
                          </a>
                        )}
                      </>
                    ) : null,
                  },
                  { label: 'Project reference', value: rfq.projectReference },
                  { label: 'Required by', value: rfq.requiredBy ? formatDate(rfq.requiredBy) : null },
                  { label: 'Last updated', value: formatDateTime(rfq.updatedAt) },
                ]}
              />
              <div>
                <SectionLabel>Delivery site</SectionLabel>
                <AddressBlock address={rfq.deliveryAddress} fallback={rfq.shippingAddress} />
              </div>
            </div>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Quotations" description={rfq.quotations.length > 0 ? 'Newest revision first, including drafts.' : undefined} />
            {rfq.quotations.length === 0 ? (
              <div className="p-5">
                {canQuote && open ? (
                  <EmptyState
                    title="No quotation yet"
                    description="Price the requested items — the organization’s trade discount is applied automatically — then send it to the customer."
                    action={<LinkButton href={createHref}>Create quotation</LinkButton>}
                  />
                ) : (
                  <p className="text-sm text-slate-500">No quotation was issued for this request.</p>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {rfq.quotations.map((quotation) => (
                  <li key={quotation.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div>
                      {canQuote ? (
                        <Link href={`/admin/quotations/${quotation.id}`} className="font-mono text-sm font-semibold text-brand-700 hover:underline">
                          {quotation.displayNumber}
                        </Link>
                      ) : (
                        <span className="font-mono text-sm font-semibold text-ink-900">{quotation.displayNumber}</span>
                      )}
                      <p className="text-xs text-slate-500">
                        Created {formatDate(quotation.createdAt)} · valid until {formatDate(quotation.validUntil)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <QuotationStatusBadge status={quotation.status} expired={quotation.isExpired} />
                      <span className="font-semibold tabular-nums text-ink-900">{aed(quotation.total)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {rfq.notes && (
            <Card className="p-5">
              <SectionLabel>Notes from the customer</SectionLabel>
              <p className="whitespace-pre-line text-sm text-slate-700">{rfq.notes}</p>
            </Card>
          )}

          <section>
            <h2 className="mb-3 text-base font-semibold text-ink-900">
              Requested items <span className="font-normal text-slate-500">· {pluralize(rfq.items.length, 'line')}</span>
            </h2>
            <Table>
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th className="text-right">Quantity</Th>
                  <Th>Customer note</Th>
                </tr>
              </thead>
              <tbody>
                {rfq.items.map((item) => (
                  <tr key={item.id}>
                    <Td>
                      <p className="font-medium text-ink-900">{item.productName}</p>
                      <p className="font-mono text-xs text-slate-400">
                        {item.sku}
                        {!item.productId && <span className="ml-2 font-sans text-amber-700">No longer in the catalog</span>}
                      </p>
                    </Td>
                    <Td className="text-right tabular-nums">{item.quantity}</Td>
                    <Td className="text-slate-600">{item.notes ?? <span className="text-slate-400">—</span>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </section>
        </div>
      </div>
    </>
  );
}

export default function AdminRfqPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireAuth permission={Permission.RFQS_MANAGE}>
      <RfqDetail key={id} id={id} />
    </RequireAuth>
  );
}
