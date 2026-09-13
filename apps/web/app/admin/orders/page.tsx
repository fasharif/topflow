'use client';

import { ORDER_STATUS_LABELS, OrderChannel, OrderStatus, Permission, enumValues, type OrderSummaryDto, type Paginated } from '@topflow/shared';
import Link from 'next/link';
import { Suspense } from 'react';
import { CHANNEL_LABELS, ChannelBadge, QueryError } from '@/components/admin/detail';
import { FilterBar, SearchBox, pickEnum, useUrlFilters } from '@/components/admin/list-filters';
import { RequireAuth } from '@/components/require-auth';
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/status-badge';
import { Button, EmptyState, LoadingBlock, PageHeader, Pagination, Select, Table, Td, Th, cx } from '@/components/ui';
import { aed, formatDate, pluralize } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api';

const STATUSES = enumValues(OrderStatus);
const CHANNELS = enumValues(OrderChannel);

function OrdersList() {
  const filters = useUrlFilters();
  const status = pickEnum(filters.get('status'), STATUSES);
  const channel = pickEnum(filters.get('channel'), CHANNELS);
  const search = filters.get('search');
  const filtered = Boolean(status || channel || search);
  const { data, error, loading, reload } = useApiQuery<Paginated<OrderSummaryDto>>('/admin/orders', {
    query: { page: filters.page, status, channel, search },
  });
  const clear = () => filters.update({ status: null, channel: null, search: null });

  return (
    <>
      <PageHeader title="Orders" description="Retail and trade orders — confirm, fulfil, dispatch and collect payment." />

      <FilterBar>
        <SearchBox
          key={search}
          initial={search}
          label="Search orders"
          placeholder="Order number, customer, organization, PO or project…"
          onSearch={(value) => filters.update({ search: value })}
        />
        <Select aria-label="Filter by status" value={status} onChange={(event) => filters.update({ status: event.target.value })} className="md:w-48">
          <option value="">All statuses</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {ORDER_STATUS_LABELS[value]}
            </option>
          ))}
        </Select>
        <Select aria-label="Filter by channel" value={channel} onChange={(event) => filters.update({ channel: event.target.value })} className="md:w-40">
          <option value="">All channels</option>
          {CHANNELS.map((value) => (
            <option key={value} value={value}>
              {CHANNEL_LABELS[value]}
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
        <QueryError error={error} onRetry={reload} title="Could not load orders" />
      ) : !data ? (
        <LoadingBlock label="Loading orders…" />
      ) : data.items.length === 0 ? (
        <EmptyState
          title={filtered ? 'No orders match these filters' : 'No orders yet'}
          description={filtered ? 'Try a different status, channel or search term.' : 'Orders placed online or accepted from quotations appear here.'}
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
          <p className="mb-2 text-sm text-slate-500">{pluralize(data.total, 'order')}</p>
          <Table>
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Channel</Th>
                <Th>Customer</Th>
                <Th>Organization</Th>
                <Th className="text-right">Total</Th>
                <Th>Status</Th>
                <Th>Placed</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((order) => (
                <tr key={order.id} className="hover:bg-slate-50/70">
                  <Td>
                    <Link href={`/admin/orders/${order.id}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline">
                      {order.orderNumber}
                    </Link>
                    <p className="text-xs text-slate-500">{pluralize(order.itemCount, 'line')}</p>
                  </Td>
                  <Td>
                    <ChannelBadge channel={order.channel} />
                  </Td>
                  <Td>
                    <p className="font-medium text-ink-900">{order.customer?.fullName ?? '—'}</p>
                    {order.customer?.email && <p className="text-xs text-slate-500">{order.customer.email}</p>}
                  </Td>
                  <Td className="text-slate-700">{order.organization?.name ?? <span className="text-slate-400">—</span>}</Td>
                  <Td className="whitespace-nowrap text-right font-medium tabular-nums text-ink-900">{aed(order.totalAmount)}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      <OrderStatusBadge status={order.status} />
                      <PaymentStatusBadge status={order.paymentStatus} />
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap text-slate-500">{formatDate(order.createdAt)}</Td>
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

export default function AdminOrdersPage() {
  return (
    <RequireAuth permission={Permission.ORDERS_READ_ALL}>
      <Suspense fallback={<LoadingBlock />}>
        <OrdersList />
      </Suspense>
    </RequireAuth>
  );
}
