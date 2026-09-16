'use client';

import type { OrderSummaryDto, Paginated } from '@topflow/shared';
import { ChevronRight, Package } from 'lucide-react';
import Link from 'next/link';
import { OrderStatusBadge } from '@/components/status-badge';
import { Alert, ArrowLink, Button, Card, CardHeader, EmptyState, LinkButton, LoadingBlock, cx } from '@/components/ui';
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
        action={hasOrders ? <ArrowLink href="/account/orders">View all orders</ArrowLink> : undefined}
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
        <div className="p-5">
          <EmptyState
            icon={<Package aria-hidden="true" />}
            title="No orders yet"
            description="Once you place an order you can follow its progress from here."
            action={<LinkButton href="/products">Browse products</LinkButton>}
          />
        </div>
      ) : (
        <ul className="divide-y divide-slate-200">
          {orders.map((order, index) => (
            <li key={order.id}>
              <Link
                href={`/account/orders/${order.id}`}
                className={cx(
                  'group flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-slate-50',
                  // The card does not clip its children, so the last row's hover fill follows its corners.
                  index === orders.length - 1 && 'rounded-b-xl',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-sm font-medium text-ink-900 group-hover:text-brand-700">{order.orderNumber}</span>
                  <span className="block text-xs text-slate-600">
                    {formatDate(order.createdAt)} · {pluralize(order.itemCount, 'item')}
                  </span>
                </span>
                <OrderStatusBadge status={order.status} />
                <span className="min-w-24 text-right text-sm font-semibold tabular-nums text-ink-900">{aed(order.totalAmount)}</span>
                <ChevronRight aria-hidden="true" className="hidden size-4 text-slate-400 transition-colors group-hover:text-brand-600 sm:block" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
