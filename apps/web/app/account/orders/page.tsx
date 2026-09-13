'use client';

import { ORDER_STATUS_LABELS, type OrderStatus, type OrderSummaryDto, type Paginated } from '@topflow/shared';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, type FormEvent } from 'react';
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/status-badge';
import { Alert, Button, EmptyState, Field, Input, LinkButton, LoadingBlock, PageHeader, Pagination, Select, Table, Td, Th, cx } from '@/components/ui';
import { aed, formatDate, pluralize } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api';

function isOrderStatus(value: string | null): value is OrderStatus {
  return value !== null && Object.hasOwn(ORDER_STATUS_LABELS, value);
}

/** Filters and the page number live in the URL, so refresh and the back button keep the view. */
function OrdersList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const searchInput = useRef<HTMLInputElement>(null);

  const page = Math.max(1, Math.floor(Number(params.get('page'))) || 1);
  const statusParam = params.get('status');
  const status = isOrderStatus(statusParam) ? statusParam : '';
  const search = params.get('search')?.trim() ?? '';
  const filtered = Boolean(status || search);

  const { data, error, loading, reload } = useApiQuery<Paginated<OrderSummaryDto>>('/me/orders', { query: { page, status, search } });

  // Keep the uncontrolled search box in step with the URL (back/forward, "Clear filters").
  useEffect(() => {
    const input = searchInput.current;
    if (input && document.activeElement !== input) input.value = search;
  }, [search]);

  const navigate = (patch: Record<string, string | null>, scroll = false) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll });
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get('search') ?? '').trim();
    navigate({ search: value || null, page: null });
  };

  const clearFilters = () => navigate({ status: null, search: null, page: null });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs md:flex-row md:items-end">
        <form role="search" onSubmit={submitSearch} className="flex flex-1 items-end gap-2">
          <Field label="Search" htmlFor="order-search" className="flex-1">
            <Input ref={searchInput} id="order-search" name="search" type="search" defaultValue={search} placeholder="Order number, e.g. TF-SO-2026-000123" autoComplete="off" />
          </Field>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
        <Field label="Status" htmlFor="order-status" className="md:w-52">
          <Select id="order-status" value={status} onChange={(e) => navigate({ status: e.target.value || null, page: null })}>
            <option value="">All statuses</option>
            {Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        {filtered && (
          <Button variant="ghost" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      {error ? (
        <Alert tone="danger" title="We couldn't load your orders">
          <p>{error.message}</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={reload}>
            Try again
          </Button>
        </Alert>
      ) : !data ? (
        <LoadingBlock label="Loading your orders…" />
      ) : data.items.length === 0 ? (
        filtered || page > 1 ? (
          <EmptyState
            title="No orders match your filters"
            description="Try a different order number or status."
            action={
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="You haven't placed any orders yet"
            description="Sprinklers, drip lines, valves and controllers are delivered across the UAE, with payment on delivery."
            action={<LinkButton href="/products">Browse products</LinkButton>}
          />
        )
      ) : (
        <div aria-busy={loading} className={cx('transition-opacity', loading && 'opacity-60')}>
          <p className="mb-2 text-sm text-slate-500">{pluralize(data.total, 'order')}</p>
          <Table>
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Placed</Th>
                <Th className="text-right">Items</Th>
                <Th className="text-right">Total</Th>
                <Th>Status</Th>
                <Th>Payment</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((order) => (
                <tr key={order.id} className="transition hover:bg-slate-50/70">
                  <Td>
                    <Link href={`/account/orders/${order.id}`} className="font-medium text-brand-700 hover:underline">
                      {order.orderNumber}
                    </Link>
                  </Td>
                  <Td className="whitespace-nowrap text-slate-600">{formatDate(order.createdAt)}</Td>
                  <Td className="text-right tabular-nums">{order.itemCount}</Td>
                  <Td className="whitespace-nowrap text-right font-semibold tabular-nums text-ink-900">{aed(order.totalAmount)}</Td>
                  <Td>
                    <OrderStatusBadge status={order.status} />
                  </Td>
                  <Td>
                    <PaymentStatusBadge status={order.paymentStatus} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={data.page} totalPages={data.totalPages} onPage={(next) => navigate({ page: next > 1 ? String(next) : null }, true)} />
        </div>
      )}
    </div>
  );
}

export default function OrdersPage() {
  return (
    <div>
      <PageHeader
        title="Orders"
        description="Track deliveries and look back at everything you've bought."
        actions={
          <LinkButton href="/products" variant="secondary">
            Continue shopping
          </LinkButton>
        }
      />
      <Suspense fallback={<LoadingBlock label="Loading your orders…" />}>
        <OrdersList />
      </Suspense>
    </div>
  );
}
