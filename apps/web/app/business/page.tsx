'use client';

import {
  ORG_ROLE_LABELS,
  OrgPermission,
  OrgStatus,
  QuotationStatus,
  RfqStatus,
  type OrderSummaryDto,
  type Paginated,
  type QuotationSummaryDto,
  type RfqDto,
} from '@topflow/shared';
import { ClipboardList, FileText, Hourglass, Package } from 'lucide-react';
import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { FlagAlert } from '@/components/business/feedback';
import { useOrg } from '@/components/business/use-org';
import { OrderStatusBadge, QuotationStatusBadge } from '@/components/status-badge';
import { Alert, ArrowLink, Card, CardHeader, LinkButton, PageHeader, Spinner, Stat } from '@/components/ui';
import { aed, formatDate } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api';

function statValue(total: number | undefined, failed: boolean): ReactNode {
  if (failed) return '—';
  return total === undefined ? <Spinner className="size-6 text-slate-400" /> : total;
}

function StatLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="block rounded-xl transition hover:shadow-raised motion-safe:hover:-translate-y-0.5">
      {children}
    </Link>
  );
}

function QuotationRows({ items, action }: { items: QuotationSummaryDto[]; action: string }) {
  return (
    <ul className="divide-y divide-slate-200">
      {items.map((quotation) => (
        <li key={quotation.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/business/quotations/${quotation.id}`}
                className="font-mono text-sm font-semibold text-brand-700 underline-offset-4 hover:underline"
              >
                {quotation.displayNumber}
              </Link>
              <QuotationStatusBadge status={quotation.status} expired={quotation.isExpired} />
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {quotation.customer ? `${quotation.customer.fullName} · ` : ''}
              {quotation.isExpired ? 'expired' : 'valid until'} {formatDate(quotation.validUntil)}
            </p>
          </div>
          <p className="font-semibold tabular-nums text-ink-900">{aed(quotation.total)}</p>
          {!quotation.isExpired && (
            <LinkButton href={`/business/quotations/${quotation.id}`} size="sm" variant="secondary">
              {action}
            </LinkButton>
          )}
        </li>
      ))}
    </ul>
  );
}

function PanelMessage({ children }: { children: ReactNode }) {
  return <div className="px-5 py-8 text-center text-sm text-slate-600">{children}</div>;
}

const STEPS = [
  { title: 'Build your list', body: 'Add products to the cart — trade-only items included.' },
  { title: 'Submit an RFQ', body: 'Add a project reference, delivery site and required date.' },
  { title: 'Review the quotation', body: 'Accept it, ask for changes or reject it — with your PO number.' },
  { title: 'Track the order', body: 'Accepted quotations become orders on your account terms.' },
];

export default function BusinessOverviewPage() {
  const { user, membership, can } = useOrg();
  const awaiting = useApiQuery<Paginated<QuotationSummaryDto>>('/org/quotations', { org: true, query: { status: QuotationStatus.SENT, pageSize: 5 } });
  const pending = useApiQuery<Paginated<QuotationSummaryDto>>('/org/quotations', { org: true, query: { status: QuotationStatus.PENDING_APPROVAL, pageSize: 5 } });
  const submitted = useApiQuery<Paginated<RfqDto>>('/org/rfqs', { org: true, query: { status: RfqStatus.SUBMITTED, pageSize: 1 } });
  const inReview = useApiQuery<Paginated<RfqDto>>('/org/rfqs', { org: true, query: { status: RfqStatus.IN_REVIEW, pageSize: 1 } });
  const orders = useApiQuery<Paginated<OrderSummaryDto>>('/org/orders', { org: true, query: { pageSize: 5 } });

  if (!membership) return null;

  const canApprove = can(OrgPermission.PURCHASE_APPROVE);
  const openRfqs = submitted.data && inReview.data ? submitted.data.total + inReview.data.total : undefined;
  const pendingTotal = pending.data?.total ?? 0;
  const awaitingTotal = awaiting.data?.total ?? 0;
  const brandNew =
    orders.data?.total === 0 && awaiting.data?.total === 0 && pending.data?.total === 0 && openRfqs === 0;

  return (
    <div>
      <PageHeader
        title={`Welcome${user ? `, ${user.fullName.split(' ')[0]}` : ''}`}
        description={`Here's what needs attention at ${membership.organizationName}.`}
        actions={
          <>
            <LinkButton href="/business/quotations" variant="secondary">
              View quotations
            </LinkButton>
            <LinkButton href="/products">Start a new RFQ</LinkButton>
          </>
        }
      />

      <Suspense fallback={null}>
        <FlagAlert flag="welcome" title="Trade account application received">
          Thanks for applying. Top Flow is verifying {membership.organizationName} and will email you once it&apos;s approved. You can browse trade
          products and request quotations in the meantime.
        </FlagAlert>
        <FlagAlert flag="joined" title={`Welcome to ${membership.organizationName}`}>
          You&apos;ve joined as {ORG_ROLE_LABELS[membership.role]}. Quotations, orders and delivery sites for the organization are now available here.
        </FlagAlert>
      </Suspense>

      {membership.organizationStatus === OrgStatus.PENDING_VERIFICATION && (
        <Alert tone="warning" title="Verification in progress" className="mb-6">
          You can request quotations right away, but they can only be accepted once Top Flow has verified {membership.organizationName}&apos;s trade
          licence and company details.
        </Alert>
      )}
      {membership.organizationStatus === OrgStatus.SUSPENDED && (
        <Alert tone="warning" title="Account suspended" className="mb-6">
          Purchasing is paused for {membership.organizationName}. Contact your Top Flow account manager to restore it.
        </Alert>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatLink href="/business/quotations?status=SENT">
          <Stat
            label="Awaiting your response"
            value={statValue(awaiting.data?.total, Boolean(awaiting.error))}
            tone={awaitingTotal > 0 ? 'brand' : 'neutral'}
            hint="Quotations ready for a decision"
            icon={<FileText aria-hidden="true" />}
          />
        </StatLink>
        <StatLink href="/business/quotations?status=PENDING_APPROVAL">
          <Stat
            label="Pending approval"
            value={statValue(pending.data?.total, Boolean(pending.error))}
            tone={pendingTotal > 0 ? 'warning' : 'neutral'}
            hint={canApprove ? 'Purchases waiting for sign-off' : 'Waiting for an approver'}
            icon={<Hourglass aria-hidden="true" />}
          />
        </StatLink>
        <StatLink href="/business/rfqs">
          <Stat
            label="Open RFQs"
            value={statValue(openRfqs, Boolean(submitted.error || inReview.error))}
            hint="Submitted or being priced"
            icon={<ClipboardList aria-hidden="true" />}
          />
        </StatLink>
        <StatLink href="/business/orders">
          <Stat
            label="Orders"
            value={statValue(orders.data?.total, Boolean(orders.error))}
            hint="Placed through the portal"
            icon={<Package aria-hidden="true" />}
          />
        </StatLink>
      </div>

      {canApprove && pendingTotal > 0 && pending.data && (
        <Card tone="warning" className="mb-6">
          <CardHeader
            title="Waiting for your approval"
            description="These purchases exceed a colleague's limit. Nothing is ordered until an approver signs off."
            action={
              pendingTotal > pending.data.items.length ? (
                <ArrowLink href="/business/quotations?status=PENDING_APPROVAL">View all {pendingTotal}</ArrowLink>
              ) : undefined
            }
          />
          <QuotationRows items={pending.data.items} action="Review" />
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Quotations awaiting response" action={<ArrowLink href="/business/quotations?status=SENT">View all</ArrowLink>} />
          {awaiting.error ? (
            <PanelMessage>{awaiting.error.message}</PanelMessage>
          ) : !awaiting.data ? (
            <PanelMessage>
              <Spinner className="mx-auto size-5 text-brand-600" />
            </PanelMessage>
          ) : awaiting.data.items.length === 0 ? (
            <PanelMessage>Nothing waiting for you. New quotations appear here as soon as Top Flow prices your RFQs.</PanelMessage>
          ) : (
            <QuotationRows items={awaiting.data.items} action="Respond" />
          )}
        </Card>

        <Card>
          <CardHeader title="Recent orders" action={<ArrowLink href="/business/orders">View all</ArrowLink>} />
          {orders.error ? (
            <PanelMessage>{orders.error.message}</PanelMessage>
          ) : !orders.data ? (
            <PanelMessage>
              <Spinner className="mx-auto size-5 text-brand-600" />
            </PanelMessage>
          ) : orders.data.items.length === 0 ? (
            <PanelMessage>No orders yet. Accepted quotations become orders automatically.</PanelMessage>
          ) : (
            <ul className="divide-y divide-slate-200">
              {orders.data.items.map((order) => (
                <li key={order.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/business/orders/${order.id}`}
                      className="font-mono text-sm font-semibold text-brand-700 underline-offset-4 hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatDate(order.createdAt)}
                      {order.customer ? ` · ${order.customer.fullName}` : ''}
                    </p>
                  </div>
                  <p className="font-semibold tabular-nums text-ink-900">{aed(order.totalAmount)}</p>
                  <OrderStatusBadge status={order.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {brandNew && (
        <Card className="mt-6">
          <CardHeader title="How trade buying works" />
          <div className="p-5">
            <ol className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700 ring-1 ring-brand-200 ring-inset">
                    {index + 1}
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-ink-900">{step.title}</span>
                    <span className="block text-sm text-slate-600">{step.body}</span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-5">
              <LinkButton href="/products">Browse products</LinkButton>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
