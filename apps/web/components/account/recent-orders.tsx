'use client';

import type { OrderSummaryDto, Paginated } from '@topflow/shared';
import Link from 'next/link';
import { OrderStatusBadge } from '@/components/status-badge';
import { Alert, Button, Card, CardHeader, LinkButton, LoadingBlock } from '@/components/ui';
import { aed, formatDate, pluralize } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api';

const RECENT_ORDERS_QUERY = { pageSize: 5 };

export function RecentOrders() {
  const { data, error, loading, reload } = useApiQuery<Paginated<OrderSummaryDto>>('/me/orders', { query: RECENT_ORDERS_QUERY });
  const orders = data?.items ?? [];
  const hasOrders = Boolean(data && data.total > 0);

  return (
    <Card>
      <CardHeader
        title="Recent orders"
        description={hasOrders && data ? `${pluralize(data.total, 'order')} placed with Top Flow` : 'Track deliveries and review past purchases.'}
        action={
          hasOrders ? (
            <LinkButton href="/account/orders" variant="secondary" size="sm">
              View all orders
            </LinkButton>
          ) : undefined
        }
      />

      {error ? (
        <div className="space-y-3 p-5">
          <Alert tone="danger">{error.message}</Alert>
          <Button variant="secondary" size="sm" onClick={reload}>
            Try again
          </Button>
        </div>
      ) : loading && !data ? (
        <LoadingBlock label="Loading your orders…" />
      ) : orders.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="font-medium text-ink-900">No orders yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">Once you place an order you can follow its progress from here.</p>
          <LinkButton href="/products" className="mt-4">
            Browse products
          </LinkButton>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {orders.map((order) => (
            <li key={order.id}>
              <Link href={`/account/orders/${order.id}`} className="group flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 transition hover:bg-slate-50">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink-900 group-hover:text-brand-700">{order.orderNumber}</span>
                  <span className="block text-xs text-slate-500">
                    {formatDate(order.createdAt)} · {pluralize(order.itemCount, 'item')}
                  </span>
                </span>
                <OrderStatusBadge status={order.status} />
                <span className="min-w-24 text-right text-sm font-semibold text-ink-900">{aed(order.totalAmount)}</span>
                <svg viewBox="0 0 20 20" className="hidden size-4 text-slate-300 group-hover:text-brand-600 sm:block" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="m8 5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
