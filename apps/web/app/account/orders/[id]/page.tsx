'use client';

import { EMIRATE_LABELS, OrderStatus, PAYMENT_METHOD_LABELS, PaymentStatus, isCustomerCancellable, type OrderDto } from '@topflow/shared';
import { PackageSearch } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useState, type ReactNode } from 'react';
import { CancelOrderCard } from '@/components/account/cancel-order';
import { OrderItemsCard } from '@/components/account/order-items';
import { OrderProgress } from '@/components/account/order-progress';
import { OrderTimeline } from '@/components/account/order-timeline';
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/status-badge';
import { Alert, BackLink, Button, Card, CardHeader, EmptyState, LinkButton, LoadingBlock, PageHeader } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useApiQuery } from '@/lib/use-api';

const AWAITING_DISPATCH: OrderStatus[] = [OrderStatus.PENDING_PAYMENT, OrderStatus.CONFIRMED, OrderStatus.PROCESSING];

function PlacedBanner() {
  const params = useSearchParams();
  if (params.get('placed') !== '1') return null;
  return (
    <Alert tone="success" title="Order placed — we'll call you before delivery">
      Thank you for shopping with Top Flow. You can follow your order&apos;s progress on this page at any time.
    </Alert>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="eyebrow text-slate-600">{label}</dt>
      <dd className="mt-1 text-sm text-ink-900">{children}</dd>
    </div>
  );
}

function DeliveryCard({ order }: { order: OrderDto }) {
  const address = order.deliveryAddress;
  return (
    <Card>
      <CardHeader title="Delivery" />
      <dl className="space-y-4 p-5">
        <Detail label="Deliver to">
          {address ? (
            <address className="not-italic leading-relaxed text-slate-700">
              <span className="font-medium text-ink-900">{address.contactName}</span> · {address.phoneNumber}
              <br />
              {address.line1}
              {address.line2 && <>, {address.line2}</>}
              <br />
              {address.area}, {address.city}
              <br />
              {EMIRATE_LABELS[address.emirate]}, {address.country === 'AE' ? 'United Arab Emirates' : address.country}
            </address>
          ) : (
            <span className="whitespace-pre-line text-slate-700">{order.shippingAddress}</span>
          )}
        </Detail>
        <Detail label="Tracking reference">
          {order.trackingReference ? (
            <span className="font-mono">{order.trackingReference}</span>
          ) : (
            <span className="text-slate-600">{AWAITING_DISPATCH.includes(order.status) ? 'Shared once your order is dispatched' : '—'}</span>
          )}
        </Detail>
        {order.dispatchedAt && <Detail label="Dispatched">{formatDateTime(order.dispatchedAt)}</Detail>}
        {order.deliveredAt && <Detail label="Delivered">{formatDateTime(order.deliveredAt)}</Detail>}
        {order.notes && (
          <Detail label="Delivery notes">
            <span className="whitespace-pre-line text-slate-700">{order.notes}</span>
          </Detail>
        )}
      </dl>
    </Card>
  );
}

function PaymentCard({ order }: { order: OrderDto }) {
  return (
    <Card>
      <CardHeader title="Payment" />
      <dl className="space-y-4 p-5">
        <Detail label="Method">{order.paymentMethod ? PAYMENT_METHOD_LABELS[order.paymentMethod] : 'Not selected'}</Detail>
        <Detail label="Status">
          <PaymentStatusBadge status={order.paymentStatus} />
        </Detail>
        {order.paidAt && <Detail label="Paid on">{formatDateTime(order.paidAt)}</Detail>}
        {order.paymentReference && (
          <Detail label="Payment reference">
            <span className="font-mono">{order.paymentReference}</span>
          </Detail>
        )}
        {/* Paid orders are cancelled by Top Flow, so the refund is arranged at the same time. */}
        {isCustomerCancellable(order.status, PaymentStatus.UNPAID) && order.paymentStatus === PaymentStatus.PAID && (
          <p className="text-sm leading-relaxed text-slate-600">
            You have paid for this order, so it can no longer be cancelled here.{' '}
            <Link href="/contact" className="font-semibold text-brand-700 underline-offset-4 hover:underline">
              Contact us
            </Link>{' '}
            and we will cancel it and refund you.
          </p>
        )}
      </dl>
    </Card>
  );
}

function OrderDetail({ id }: { id: string }) {
  const { user } = useSession();
  const { data, error, reload } = useApiQuery<OrderDto>(`/me/orders/${id}`);
  // Cancelling returns the updated order, which replaces the fetched copy.
  const [cancelledOrder, setCancelledOrder] = useState<OrderDto | null>(null);
  const order = cancelledOrder ?? data;

  if (!order && error) {
    // Unknown ids (404) and malformed ones (400 from the UUID check) both mean "not yours / not found".
    if (error.status === 404 || error.status === 400) {
      return (
        <EmptyState
          icon={<PackageSearch aria-hidden="true" />}
          title="Order not found"
          description="This order doesn't exist or belongs to a different account."
          action={<LinkButton href="/account/orders">Back to your orders</LinkButton>}
        />
      );
    }
    return (
      <Alert tone="danger" title="We couldn't load this order">
        <p>{error.message}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={reload}>
          Try again
        </Button>
      </Alert>
    );
  }
  if (!order) return <LoadingBlock label="Loading order…" />;

  return (
    <div>
      <BackLink href="/account/orders">All orders</BackLink>
      <PageHeader
        eyebrow="Order"
        title={<span className="font-mono">{order.orderNumber}</span>}
        description={`Placed ${formatDateTime(order.createdAt)}`}
        actions={
          <>
            <OrderStatusBadge status={order.status} />
            <PaymentStatusBadge status={order.paymentStatus} />
          </>
        }
      />

      <div className="space-y-6">
        <Suspense fallback={null}>
          <PlacedBanner />
        </Suspense>
        {cancelledOrder && (
          <Alert tone="success" title="Your order has been cancelled">
            Our team has been notified and nothing will be dispatched.
          </Alert>
        )}

        <Card className="p-5 sm:p-6">
          <h2 className="sr-only">Order progress</h2>
          <OrderProgress order={order} />
        </Card>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-6">
            <OrderItemsCard order={order} />
            <Card>
              <CardHeader title="Order history" description="Every update on this order, newest first." />
              <div className="p-5">
                <OrderTimeline events={order.events} currentUserId={user?.id} />
              </div>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-1">
            <DeliveryCard order={order} />
            <PaymentCard order={order} />
            {order.canCancel && <CancelOrderCard orderId={order.id} onCancelled={setCancelledOrder} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function OrderDetailRoute() {
  const { id } = useParams<{ id: string }>();
  // Keyed by id so local state (e.g. a just-cancelled order) never leaks between orders.
  return <OrderDetail key={id} id={id} />;
}

export default function OrderDetailPage() {
  return (
    <Suspense fallback={<LoadingBlock label="Loading order…" />}>
      <OrderDetailRoute />
    </Suspense>
  );
}
