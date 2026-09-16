'use client';

import {
  OrderStatus,
  PAYMENT_METHOD_LABELS,
  PAYMENT_TERMS_LABELS,
  PaymentMethod,
  cancelOrderSchema,
  quotationDisplayNumber,
  type OrderDto,
  type OrganizationDto,
} from '@topflow/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AddressBlock, DetailItem, DetailList, Prose } from '@/components/business/detail-list';
import { DocumentLines, DocumentTotals } from '@/components/business/document-lines';
import { BackLink, LoadError } from '@/components/business/feedback';
import { OrderProgress, OrderTimeline } from '@/components/business/order-progress';
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/status-badge';
import { Alert, Button, Card, CardHeader, Field, LoadingBlock, Textarea } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { aed, formatDateTime, pluralize } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api';

function CancelOrderCard({ order, onCancelled }: { order: OrderDto; onCancelled: (order: OrderDto) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const parsed = cancelOrderSchema.safeParse({ reason });
    if (!parsed.success) {
      setReasonError(parsed.error.issues[0]?.message);
      return;
    }
    setReasonError(undefined);
    setSubmitting(true);
    try {
      onCancelled(await api<OrderDto>(`/org/orders/${order.id}/cancel`, { method: 'POST', org: true, body: parsed.data }));
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Cancel order" description="Possible until the warehouse starts picking your goods." />
      <div className="p-5">
        {open ? (
          <form onSubmit={submit} className="space-y-3" noValidate>
            <Field label="Reason for cancelling" htmlFor="cancel-reason" error={reasonError}>
              <Textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} aria-invalid={Boolean(reasonError)} />
            </Field>
            {error && <Alert tone="danger">{error}</Alert>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="danger" loading={submitting}>
                Cancel order
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
                Keep order
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="secondary" className="w-full" onClick={() => setOpen(true)}>
            Cancel this order…
          </Button>
        )}
      </div>
    </Card>
  );
}

function OrderView({ initial }: { initial: OrderDto }) {
  const [order, setOrder] = useState(initial);
  const [notice, setNotice] = useState<string | null>(null);
  const onCredit = order.paymentMethod === PaymentMethod.CREDIT_ACCOUNT;
  const organization = useApiQuery<OrganizationDto>(onCredit ? '/org' : null, { org: true });
  const cancelled = order.status === OrderStatus.CANCELLED;

  return (
    <div>
      <BackLink href="/business/orders">All orders</BackLink>

      <div className="mb-6">
        <p className="eyebrow text-brand-700">Sales order</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="heading-1 font-mono text-ink-900">{order.orderNumber}</h1>
          <OrderStatusBadge status={order.status} />
          <PaymentStatusBadge status={order.paymentStatus} />
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Placed {formatDateTime(order.createdAt)}
          {order.customer && ` by ${order.customer.fullName}`} · {aed(order.totalAmount)} incl. VAT
        </p>
      </div>

      <div className="mb-6 space-y-3 empty:hidden">
        {notice && <Alert tone="success">{notice}</Alert>}
        {cancelled ? (
          <Alert tone="warning" title={`Cancelled ${formatDateTime(order.cancelledAt)}`}>
            {order.cancellationReason ?? 'No reason was recorded.'}
          </Alert>
        ) : order.status === OrderStatus.PENDING_PAYMENT ? (
          <Alert tone="info" title="Awaiting payment">
            {order.paymentMethod === PaymentMethod.BANK_TRANSFER
              ? `Please transfer ${aed(order.totalAmount)} quoting ${order.orderNumber}${order.purchaseOrderNumber ? ` and PO ${order.purchaseOrderNumber}` : ''}. `
              : ''}
            The order is released to our warehouse as soon as payment is confirmed.
          </Alert>
        ) : order.status === OrderStatus.DISPATCHED ? (
          <Alert tone="info" title="On its way">
            Your goods have left our warehouse{order.trackingReference ? ` — tracking reference ${order.trackingReference}` : ''}.
          </Alert>
        ) : null}
      </div>

      {!cancelled && (
        <Card className="mb-6 px-5 py-6">
          <OrderProgress order={order} />
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Card className="overflow-hidden">
            <CardHeader title="Items" description={pluralize(order.items.length, 'line')} />
            <DocumentLines items={order.items} />
            <div className="border-t border-slate-200 bg-slate-50 px-5 py-4">
              <div className="sm:ml-auto sm:max-w-sm">
                <DocumentTotals
                  subtotal={order.subtotal}
                  discountTotal={order.discountTotal}
                  deliveryFee={order.deliveryFee}
                  vatAmount={order.vatAmount}
                  vatRateBps={order.vatRateBps}
                  total={order.totalAmount}
                />
              </div>
            </div>
          </Card>

          {order.notes && (
            <Card>
              <CardHeader title="Notes" />
              <div className="px-5 py-4">
                <Prose>{order.notes}</Prose>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Order history" />
            <OrderTimeline events={order.events} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <DetailList>
              <DetailItem stacked label="Purchase order number">
                {order.purchaseOrderNumber && <span className="font-mono">{order.purchaseOrderNumber}</span>}
              </DetailItem>
              <DetailItem stacked label="Project reference">{order.projectReference}</DetailItem>
              <DetailItem stacked label="Quotation">
                {order.quotation && (
                  <Link
                    href={`/business/quotations/${order.quotation.id}`}
                    className="font-mono font-medium text-brand-700 underline-offset-4 hover:underline"
                  >
                    {quotationDisplayNumber(order.quotation.number, order.quotation.revision)}
                  </Link>
                )}
              </DetailItem>
              <DetailItem stacked label="Delivery address">
                <AddressBlock address={order.deliveryAddress} fallback={order.shippingAddress} />
              </DetailItem>
              <DetailItem stacked label="Tracking reference">
                {order.trackingReference && <span className="font-mono">{order.trackingReference}</span>}
              </DetailItem>
            </DetailList>
          </Card>

          <Card>
            <CardHeader title="Payment" />
            <DetailList>
              <DetailItem stacked label="Method">{order.paymentMethod ? PAYMENT_METHOD_LABELS[order.paymentMethod] : null}</DetailItem>
              {onCredit && (
                <DetailItem stacked label="Account terms">
                  {organization.data ? PAYMENT_TERMS_LABELS[organization.data.paymentTerms] : organization.error ? null : '…'}
                </DetailItem>
              )}
              <DetailItem stacked label="Status">
                <span className="inline-flex flex-wrap items-center gap-2">
                  <PaymentStatusBadge status={order.paymentStatus} />
                  {order.paidAt && <span className="text-slate-500">on {formatDateTime(order.paidAt)}</span>}
                </span>
              </DetailItem>
              {order.paymentReference && (
                <DetailItem stacked label="Payment reference">
                  <span className="font-mono">{order.paymentReference}</span>
                </DetailItem>
              )}
            </DetailList>
          </Card>

          {order.canCancel && (
            <CancelOrderCard
              order={order}
              onCancelled={(updated) => {
                setOrder(updated);
                setNotice('Order cancelled. It will not be picked or dispatched.');
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = useApiQuery<OrderDto>(`/org/orders/${id}`, { org: true });

  if (error) {
    return (
      <div>
        <BackLink href="/business/orders">All orders</BackLink>
        <LoadError
          error={error}
          onRetry={reload}
          notFound={{ title: 'Order not found', description: 'It may belong to another organization you are a member of.', href: '/business/orders', label: 'Back to orders' }}
        />
      </div>
    );
  }
  if (!data || data.id !== id) return <LoadingBlock label="Loading order…" />;
  return <OrderView key={`${data.id}:${data.updatedAt}`} initial={data} />;
}
