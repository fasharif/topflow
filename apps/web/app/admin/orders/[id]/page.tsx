'use client';

import {
  ORDER_PROGRESS,
  ORDER_STATUS_LABELS,
  OrderStatus,
  PAYMENT_METHOD_LABELS,
  Permission,
  hasPermission,
  quotationDisplayNumber,
  type OrderDto,
  type OrderEventDto,
} from '@topflow/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { AddressBlock, ChannelBadge, DetailList, QueryError, SectionLabel } from '@/components/admin/detail';
import { DocumentLinesTable, DocumentTotals } from '@/components/admin/document-lines';
import { OrderActions } from '@/components/admin/order-actions';
import { RequireAuth } from '@/components/require-auth';
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/status-badge';
import { Alert, Card, CardHeader, LoadingBlock, PageHeader, cx } from '@/components/ui';
import { formatDateTime, pluralize } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useApiQuery } from '@/lib/use-api';

/** When the order last entered `status`, according to its event log. */
function reachedAt(events: OrderEventDto[], status: OrderStatus): string | null {
  let at: string | null = null;
  for (const event of events) {
    if (event.toStatus === status) at = event.createdAt;
  }
  return at;
}

function OrderProgress({ order }: { order: OrderDto }) {
  // Retail checkout skips "pending payment", so only show that step when the order went through it.
  const steps = ORDER_PROGRESS.filter(
    (status) => status !== OrderStatus.PENDING_PAYMENT || order.status === status || order.events.some((event) => event.toStatus === status),
  );
  const current = steps.indexOf(order.status);

  return (
    <ol className="grid gap-4 sm:auto-cols-fr sm:grid-flow-col">
      {steps.map((status, index) => {
        const done = index <= current;
        const at = done ? reachedAt(order.events, status) : null;
        return (
          <li key={status} className="flex items-start gap-3 sm:flex-col sm:gap-2">
            <div className="flex items-center gap-2 sm:w-full">
              <span
                className={cx(
                  'grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold',
                  done ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500',
                  index === current && 'ring-4 ring-brand-100',
                )}
              >
                {done && index !== current ? '✓' : index + 1}
              </span>
              {index < steps.length - 1 && <span className={cx('hidden h-0.5 flex-1 rounded sm:block', index < current ? 'bg-brand-600' : 'bg-slate-200')} />}
            </div>
            <div>
              <p className={cx('text-sm font-medium', done ? 'text-ink-900' : 'text-slate-500')}>{ORDER_STATUS_LABELS[status]}</p>
              {at && <p className="text-xs text-slate-500">{formatDateTime(at)}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Timeline({ events }: { events: OrderEventDto[] }) {
  if (events.length === 0) return <p className="text-sm text-slate-500">No status changes recorded yet.</p>;
  return (
    <ol className="space-y-5 border-l border-slate-200 pl-5">
      {[...events].reverse().map((event) => (
        <li key={event.id} className="relative">
          <span
            className={cx('absolute -left-[26.5px] top-1 size-3 rounded-full ring-4 ring-white', event.toStatus === OrderStatus.CANCELLED ? 'bg-slate-400' : 'bg-brand-600')}
            aria-hidden="true"
          />
          <p className="text-sm font-medium text-ink-900">
            {event.fromStatus ? `${ORDER_STATUS_LABELS[event.fromStatus]} → ${ORDER_STATUS_LABELS[event.toStatus]}` : ORDER_STATUS_LABELS[event.toStatus]}
          </p>
          <p className="text-xs text-slate-500">
            {formatDateTime(event.createdAt)} · {event.actor?.fullName ?? 'System'}
          </p>
          {event.note && <p className="mt-1.5 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{event.note}</p>}
        </li>
      ))}
    </ol>
  );
}

function OrderDetail({ id }: { id: string }) {
  const { user } = useSession();
  const query = useApiQuery<OrderDto>(`/admin/orders/${id}`);
  const [updated, setUpdated] = useState<OrderDto | null>(null);
  const order = updated ?? query.data;

  if (!order) {
    return query.error ? (
      <QueryError error={query.error} onRetry={query.reload} title="Could not load this order" backHref="/admin/orders" backLabel="Back to orders" />
    ) : (
      <LoadingBlock label="Loading order…" />
    );
  }

  const canReviewOrganizations = hasPermission(user?.role, Permission.ORGANIZATIONS_REVIEW);
  const canManageQuotations = hasPermission(user?.role, Permission.QUOTATIONS_MANAGE);
  const quotationNumber = order.quotation ? quotationDisplayNumber(order.quotation.number, order.quotation.revision) : null;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/admin/orders" className="hover:underline">
            ← Orders
          </Link>
        }
        title={order.orderNumber}
        description={
          <>
            Placed {formatDateTime(order.createdAt)} · {pluralize(order.itemCount, 'line')}
          </>
        }
        actions={
          <>
            <ChannelBadge channel={order.channel} />
            <OrderStatusBadge status={order.status} />
            <PaymentStatusBadge status={order.paymentStatus} />
          </>
        }
      />

      {order.status === OrderStatus.CANCELLED ? (
        <div className="mb-6">
          <Alert tone="warning" title={`Cancelled ${formatDateTime(order.cancelledAt)}`}>
            {order.cancellationReason ?? 'No reason was recorded.'}
          </Alert>
        </div>
      ) : (
        <Card className="mb-6 p-5">
          <OrderProgress order={order} />
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        {/* Actions first on small screens, in the right-hand column on wide ones. */}
        <div className="space-y-6 xl:order-last">
          <OrderActions order={order} onUpdated={setUpdated} />

          <Card>
            <CardHeader title="Payment" />
            <div className="p-5">
              <DetailList
                items={[
                  { label: 'Method', value: order.paymentMethod ? PAYMENT_METHOD_LABELS[order.paymentMethod] : null },
                  { label: 'Status', value: <PaymentStatusBadge status={order.paymentStatus} /> },
                  { label: 'Reference', value: order.paymentReference },
                  { label: 'Paid', value: order.paidAt ? formatDateTime(order.paidAt) : null },
                ]}
              />
            </div>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <section>
            <h2 className="mb-3 text-base font-semibold text-ink-900">Items</h2>
            <DocumentLinesTable lines={order.items} />
            <div className="mt-4 flex justify-end">
              <Card className="w-full p-5 sm:max-w-sm">
                <DocumentTotals
                  subtotal={order.subtotal}
                  discountTotal={order.discountTotal}
                  deliveryFee={order.deliveryFee}
                  vatAmount={order.vatAmount}
                  total={order.totalAmount}
                  vatRateBps={order.vatRateBps}
                />
              </Card>
            </div>
          </section>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader title="Customer" />
              <div className="p-5">
                <DetailList
                  items={[
                    {
                      label: 'Contact',
                      value: order.customer ? (
                        <>
                          <span className="block">{order.customer.fullName}</span>
                          {order.customer.email && (
                            <a href={`mailto:${order.customer.email}`} className="text-xs font-normal text-brand-700 hover:underline">
                              {order.customer.email}
                            </a>
                          )}
                        </>
                      ) : null,
                    },
                    {
                      label: 'Organization',
                      value: order.organization ? (
                        canReviewOrganizations ? (
                          <Link href={`/admin/organizations/${order.organization.id}`} className="text-brand-700 hover:underline">
                            {order.organization.name}
                          </Link>
                        ) : (
                          order.organization.name
                        )
                      ) : (
                        'Retail customer'
                      ),
                    },
                    { label: 'PO number', value: order.purchaseOrderNumber },
                    { label: 'Project reference', value: order.projectReference },
                    {
                      label: 'Quotation',
                      hidden: !order.quotation,
                      value:
                        order.quotation && canManageQuotations ? (
                          <Link href={`/admin/quotations/${order.quotation.id}`} className="text-brand-700 hover:underline">
                            {quotationNumber}
                          </Link>
                        ) : (
                          quotationNumber
                        ),
                    },
                  ]}
                />
              </div>
            </Card>

            <Card>
              <CardHeader title="Delivery" />
              <div className="space-y-4 p-5">
                <AddressBlock address={order.deliveryAddress} fallback={order.shippingAddress} />
                <DetailList
                  items={[
                    { label: 'Tracking reference', value: order.trackingReference },
                    { label: 'Dispatched', value: order.dispatchedAt ? formatDateTime(order.dispatchedAt) : null },
                    { label: 'Delivered', value: order.deliveredAt ? formatDateTime(order.deliveredAt) : null },
                  ]}
                />
                {order.notes && (
                  <div>
                    <SectionLabel>Customer notes</SectionLabel>
                    <p className="whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{order.notes}</p>
                  </div>
                )}
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader title="Timeline" description="Every status change, who made it and why." />
            <div className="p-5 pl-7">
              <Timeline events={order.events} />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

export default function AdminOrderPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireAuth permission={Permission.ORDERS_READ_ALL}>
      <OrderDetail key={id} id={id} />
    </RequireAuth>
  );
}
