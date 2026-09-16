'use client';

import { ORDER_STATUS_LABELS, OrderStatus, enumValues, type OrderSummaryDto, type Paginated } from '@topflow/shared';
import { Package, SearchX } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { LoadError } from '@/components/business/feedback';
import { ListToolbar, useListParams } from '@/components/business/list-controls';
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/status-badge';
import { Button, EmptyState, LinkButton, LoadingBlock, PageHeader, Pagination, Table, Td, Th, cx } from '@/components/ui';
import { aed, formatDate, pluralize } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api';

const STATUSES = enumValues(OrderStatus);

function OrderList() {
  const list = useListParams(STATUSES);
  const { data, error, loading, reload } = useApiQuery<Paginated<OrderSummaryDto>>('/org/orders', { org: true, query: list.query });

  return (
    <>
      <PageHeader
        title="Orders"
        description={data ? `${pluralize(data.total, 'order')}${list.filtered ? ' match your filters' : ''}` : 'Sales orders created from accepted quotations.'}
      />
      <ListToolbar
        statuses={STATUSES}
        labels={ORDER_STATUS_LABELS}
        status={list.status}
        search={list.search}
        searchPlaceholder="Search by order, PO number or project"
        onChange={list.update}
      />

      {error ? (
        <LoadError error={error} onRetry={reload} />
      ) : !data ? (
        <LoadingBlock label="Loading orders…" />
      ) : data.items.length === 0 ? (
        list.filtered ? (
          <EmptyState
            icon={<SearchX aria-hidden="true" />}
            title="No orders match your filters"
            description="Try another status or search term."
            action={
              <Button variant="secondary" onClick={() => list.update({ status: null, search: '' })}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<Package aria-hidden="true" />}
            title="No orders yet"
            description="An order is created automatically when a quotation is accepted (and approved, if it needs sign-off)."
            action={
              <LinkButton href="/business/quotations" variant="secondary">
                View quotations
              </LinkButton>
            }
          />
        )
      ) : (
        <div className={cx('transition-opacity', loading && 'opacity-60')} aria-busy={loading}>
          <Table>
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Placed by</Th>
                <Th className="text-right">Items</Th>
                <Th className="text-right">Total incl. VAT</Th>
                <Th>Status</Th>
                <Th>Payment</Th>
                <Th>Date</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((order) => (
                <tr key={order.id} className="hover:bg-slate-50">
                  <Td>
                    <Link
                      href={`/business/orders/${order.id}`}
                      className="whitespace-nowrap font-mono text-sm font-semibold text-brand-700 underline-offset-4 hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
                  </Td>
                  <Td className="whitespace-nowrap">{order.customer?.fullName ?? '—'}</Td>
                  <Td className="text-right tabular-nums">{order.itemCount}</Td>
                  <Td className="whitespace-nowrap text-right font-medium tabular-nums text-ink-900">{aed(order.totalAmount)}</Td>
                  <Td>
                    <OrderStatusBadge status={order.status} />
                  </Td>
                  <Td>
                    <PaymentStatusBadge status={order.paymentStatus} />
                  </Td>
                  <Td className="whitespace-nowrap text-slate-500">{formatDate(order.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={data.page} totalPages={data.totalPages} onPage={(page) => list.update({ page })} />
        </div>
      )}
    </>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<LoadingBlock label="Loading orders…" />}>
      <OrderList />
    </Suspense>
  );
}
