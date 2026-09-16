'use client';

import {
  ORDER_STATUS_LABELS,
  OrderStatus,
  Permission,
  RFQ_STATUS_LABELS,
  RfqSource,
  RfqStatus,
  enumValues,
  hasPermission,
  type DashboardStatsDto,
  type Paginated,
  type RfqDto,
} from '@topflow/shared';
import { Banknote, Boxes, Building, ClipboardList, Hourglass, LayoutDashboard, Package, RefreshCw, Send } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChannelBadge, QueryError } from '@/components/admin/detail';
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/status-badge';
import { ArrowLink, Badge, Button, Card, CardHeader, EmptyState, LinkButton, LoadingBlock, PageHeader, Stat, Table, Td, Th, cx } from '@/components/ui';
import { aed, formatDate, pluralize } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useApiQuery } from '@/lib/use-api';

const ORDER_STATUSES = enumValues(OrderStatus);
const RFQ_STATUSES = enumValues(RfqStatus);
const WEBSITE_RFQS_HREF = `/admin/rfqs?source=${RfqSource.WEBSITE}`;

const ORDER_BAR_COLORS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'bg-warning-500',
  CONFIRMED: 'bg-brand-500',
  PROCESSING: 'bg-flow-400',
  DISPATCHED: 'bg-flow-600',
  DELIVERED: 'bg-success-500',
  CANCELLED: 'bg-slate-300',
};

const RFQ_BAR_COLORS: Record<RfqStatus, string> = {
  SUBMITTED: 'bg-brand-500',
  IN_REVIEW: 'bg-flow-400',
  QUOTED: 'bg-success-500',
  CLOSED: 'bg-slate-400',
  CANCELLED: 'bg-slate-300',
};

function StatusBars<S extends string>({
  statuses,
  counts,
  labels,
  colors,
  hrefFor,
}: {
  statuses: readonly S[];
  counts: Record<S, number>;
  labels: Record<S, string>;
  colors: Record<S, string>;
  hrefFor?: (status: S) => string;
}) {
  const max = Math.max(1, ...statuses.map((status) => counts[status] ?? 0));
  return (
    <ul className="space-y-3">
      {statuses.map((status) => {
        const count = counts[status] ?? 0;
        return (
          <li key={status}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              {hrefFor ? (
                <Link href={hrefFor(status)} className="text-slate-600 hover:text-brand-700 hover:underline">
                  {labels[status]}
                </Link>
              ) : (
                <span className="text-slate-600">{labels[status]}</span>
              )}
              <span className="font-semibold tabular-nums text-ink-900">{count}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className={cx('h-full rounded-full', colors[status])} style={{ width: `${count === 0 ? 0 : Math.max(3, (count / max) * 100)}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function SectionTitle({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="heading-3 text-ink-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-slate-600">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function Dashboard({
  stats,
  can,
  newWebsiteRfqs,
}: {
  stats: DashboardStatsDto;
  can: (permission: Permission) => boolean;
  /** New (submitted) website enquiries, or null when the count isn't available. */
  newWebsiteRfqs: number | null;
}) {
  const canOrders = can(Permission.ORDERS_READ_ALL);
  const canRfqs = can(Permission.RFQS_MANAGE);
  const canQuotations = can(Permission.QUOTATIONS_MANAGE);
  const canOrganizations = can(Permission.ORGANIZATIONS_REVIEW);
  const canCatalog = can(Permission.CATALOG_WRITE);
  const ordersTotal = ORDER_STATUSES.reduce((sum, status) => sum + stats.ordersByStatus[status], 0);
  // RFQ counts cover every source: trade portal RFQs and website quote requests.
  const rfqsTotal = RFQ_STATUSES.reduce((sum, status) => sum + stats.rfqsByStatus[status], 0);
  const openRfqs = stats.rfqsByStatus.SUBMITTED + stats.rfqsByStatus.IN_REVIEW;

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Stat
          label="Revenue · last 30 days"
          value={aed(stats.revenueLast30Days)}
          hint="Order totals incl. VAT, excluding cancellations"
          tone="brand"
          icon={<Banknote aria-hidden="true" />}
        />
        <Stat
          label="Orders · last 30 days"
          value={stats.ordersLast30Days}
          hint={canOrders ? <ArrowLink href="/admin/orders">View all orders</ArrowLink> : 'Retail and trade'}
          icon={<Package aria-hidden="true" />}
        />
        <Stat
          label="Open RFQs"
          value={openRfqs}
          hint={canRfqs ? <ArrowLink href="/admin/rfqs?status=SUBMITTED">New requests</ArrowLink> : 'Submitted or in review, from the trade portal and website'}
          icon={<ClipboardList aria-hidden="true" />}
        />
        <Stat
          label="Quotations awaiting response"
          value={stats.quotationsAwaitingResponse}
          hint={canQuotations ? <ArrowLink href="/admin/quotations?status=SENT">Sent to customers</ArrowLink> : 'Sent to customers'}
          icon={<Send aria-hidden="true" />}
        />
        <Stat
          label="Pending customer approval"
          value={stats.quotationsPendingApproval}
          hint={
            canQuotations ? (
              <ArrowLink href="/admin/quotations?status=PENDING_APPROVAL">Waiting on the buyer’s approver</ArrowLink>
            ) : (
              'Waiting on the buyer’s approver'
            )
          }
          icon={<Hourglass aria-hidden="true" />}
        />
        <Stat
          label="Organizations to verify"
          value={stats.pendingOrganizations}
          tone={stats.pendingOrganizations > 0 ? 'warning' : 'neutral'}
          hint={canOrganizations ? <ArrowLink href="/admin/organizations">Review trade accounts</ArrowLink> : 'Trade accounts pending verification'}
          icon={<Building aria-hidden="true" />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Orders by status" description={`${pluralize(ordersTotal, 'order')} in total`} />
          <div className="p-5">
            <StatusBars
              statuses={ORDER_STATUSES}
              counts={stats.ordersByStatus}
              labels={ORDER_STATUS_LABELS}
              colors={ORDER_BAR_COLORS}
              hrefFor={canOrders ? (status) => `/admin/orders?status=${status}` : undefined}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="RFQs by status" description={`${pluralize(rfqsTotal, 'request')} in total, from the trade portal and the website`} />
          <div className="p-5">
            <StatusBars
              statuses={RFQ_STATUSES}
              counts={stats.rfqsByStatus}
              labels={RFQ_STATUS_LABELS}
              colors={RFQ_BAR_COLORS}
              hrefFor={canRfqs ? (status) => `/admin/rfqs?status=${status}` : undefined}
            />
          </div>
          {canRfqs && (
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-slate-200 px-5 py-3 text-sm">
              <span className="text-slate-600">
                Website enquiries
                {newWebsiteRfqs !== null && (
                  <>
                    {' · '}
                    <Link href={`${WEBSITE_RFQS_HREF}&status=${RfqStatus.SUBMITTED}`} className="font-semibold tabular-nums text-brand-700 hover:underline">
                      {newWebsiteRfqs} new<span className="sr-only"> website enquiries</span>
                    </Link>
                  </>
                )}
              </span>
              <ArrowLink href={WEBSITE_RFQS_HREF}>View website requests</ArrowLink>
            </div>
          )}
        </Card>
      </div>

      <section>
        <SectionTitle
          title="Recent orders"
          description="The latest orders across all channels."
          action={
            canOrders ? (
              <LinkButton href="/admin/orders" variant="secondary" size="sm">
                All orders
              </LinkButton>
            ) : undefined
          }
        />
        {stats.recentOrders.length === 0 ? (
          <EmptyState title="No orders yet" description="Orders placed online or accepted from quotations appear here." icon={<Package aria-hidden="true" />} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Customer</Th>
                <Th>Channel</Th>
                <Th className="text-right">Total</Th>
                <Th>Status</Th>
                <Th>Placed</Th>
              </tr>
            </thead>
            <tbody>
              {stats.recentOrders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-50/70">
                  <Td>
                    {canOrders ? (
                      <Link href={`/admin/orders/${order.id}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline">
                        {order.orderNumber}
                      </Link>
                    ) : (
                      <span className="font-mono text-xs font-semibold text-ink-900">{order.orderNumber}</span>
                    )}
                  </Td>
                  <Td>
                    <p className="font-medium text-ink-900">{order.customer?.fullName ?? '—'}</p>
                    {order.organization && <p className="text-xs text-slate-500">{order.organization.name}</p>}
                  </Td>
                  <Td>
                    <ChannelBadge channel={order.channel} />
                  </Td>
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
        )}
      </section>

      <section>
        <SectionTitle
          title="Low stock"
          description="Active products at or below their reorder threshold."
          action={
            canCatalog ? (
              <LinkButton href="/admin/products" variant="secondary" size="sm">
                Manage products
              </LinkButton>
            ) : undefined
          }
        />
        {stats.lowStockProducts.length === 0 ? (
          <EmptyState title="Stock levels look healthy" description="Every active product is above its reorder threshold." icon={<Boxes aria-hidden="true" />} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>SKU</Th>
                <Th>Product</Th>
                <Th className="text-right">In stock / threshold</Th>
                <Th>Level</Th>
                {canCatalog && <Th className="text-right">Action</Th>}
              </tr>
            </thead>
            <tbody>
              {stats.lowStockProducts.map((product) => (
                <tr key={product.id}>
                  <Td className="font-mono text-xs text-slate-500">{product.sku}</Td>
                  <Td className="font-medium text-ink-900">{product.name}</Td>
                  <Td className="whitespace-nowrap text-right tabular-nums">
                    <span className={cx('font-semibold', product.stockQuantity === 0 ? 'text-danger-700' : 'text-warning-700')}>{product.stockQuantity}</span>
                    <span className="text-slate-500"> / {product.lowStockThreshold}</span>
                  </Td>
                  <Td>{product.stockQuantity === 0 ? <Badge tone="danger">Out of stock</Badge> : <Badge tone="warning">Low</Badge>}</Td>
                  {canCatalog && (
                    <Td className="text-right">
                      <Link href="/admin/products" className="text-sm font-medium text-brand-700 hover:underline">
                        Restock
                      </Link>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}

export default function AdminDashboardPage() {
  const { user } = useSession();
  const role = user?.role;
  const canView = hasPermission(role, Permission.DASHBOARD_VIEW);
  const canRfqs = hasPermission(role, Permission.RFQS_MANAGE);
  const { data, error, loading, reload } = useApiQuery<DashboardStatsDto>(canView ? '/admin/dashboard' : null);
  // The dashboard stats don't split RFQs by source, so new website enquiries are counted with the existing RFQ list endpoint.
  const websiteRfqs = useApiQuery<Paginated<RfqDto>>(canView && canRfqs ? '/admin/rfqs' : null, {
    query: { source: RfqSource.WEBSITE, status: RfqStatus.SUBMITTED, pageSize: 1 },
  });
  const firstName = user?.fullName.split(' ')[0] ?? '';

  if (!canView) {
    return (
      <>
        <PageHeader eyebrow="Back office" title={firstName ? `Welcome, ${firstName}` : 'Welcome'} />
        <EmptyState
          title="Welcome to the Top Flow back office"
          description="Use the navigation to open the areas your role has access to."
          icon={<LayoutDashboard aria-hidden="true" />}
        />
      </>
    );
  }

  const refresh = () => {
    reload();
    websiteRfqs.reload();
  };

  return (
    <>
      <PageHeader
        eyebrow="Back office"
        title={firstName ? `Welcome back, ${firstName}` : 'Dashboard'}
        description="Sales, fulfilment and stock at a glance."
        actions={
          data ? (
            <Button variant="secondary" size="sm" loading={loading} onClick={refresh}>
              {!loading && <RefreshCw aria-hidden="true" />}
              Refresh
            </Button>
          ) : undefined
        }
      />
      {error ? (
        <QueryError error={error} onRetry={reload} title="Could not load the dashboard" />
      ) : !data ? (
        <LoadingBlock label="Loading dashboard…" />
      ) : (
        <Dashboard stats={data} can={(permission) => hasPermission(role, permission)} newWebsiteRfqs={websiteRfqs.data?.total ?? null} />
      )}
    </>
  );
}
