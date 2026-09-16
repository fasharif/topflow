'use client';

import { ORG_ROLE_LABELS, type MembershipSummary } from '@topflow/shared';
import { Building } from 'lucide-react';
import type { ReactNode } from 'react';
import { RequireAuth } from '@/components/require-auth';
import { OrgStatusBadge } from '@/components/status-badge';
import { Button, Card, EmptyState, Select } from '@/components/ui';
import { aed } from '@/lib/format';
import { setActiveOrganization, useSession } from '@/lib/session';
import { BusinessNav } from './business-nav';

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase())
      .join('') || 'TF'
  );
}

function OrganizationStrip({ membership, memberships }: { membership: MembershipSummary; memberships: MembershipSummary[] }) {
  const limit =
    membership.approvalLimit !== null
      ? `Purchasing limit ${aed(membership.approvalLimit)}`
      : membership.role === 'BUYER'
        ? 'Purchases need approval'
        : 'No purchasing limit';

  return (
    <Card className="mb-6 flex flex-wrap items-center justify-between gap-4 px-5 py-4">
      <div className="flex min-w-0 items-center gap-3.5">
        <span
          className="grid size-11 shrink-0 place-items-center rounded-lg bg-brand-600 text-sm font-semibold tracking-wide text-white"
          aria-hidden="true"
        >
          {initials(membership.organizationName)}
        </span>
        <div className="min-w-0">
          <p className="eyebrow text-brand-700">Trade portal</p>
          <p className="heading-3 mt-0.5 truncate text-ink-900">{membership.organizationName}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="text-slate-600">
          Your role: <span className="font-medium text-ink-900">{ORG_ROLE_LABELS[membership.role]}</span>
          <span className="hidden sm:inline"> · {limit}</span>
        </span>
        <OrgStatusBadge status={membership.organizationStatus} />
        {memberships.length > 1 && (
          <div className="w-52 max-w-full lg:hidden">
            <Select aria-label="Switch organization" value={membership.organizationId} onChange={(event) => setActiveOrganization(event.target.value)}>
              {memberships.map((m) => (
                <option key={m.organizationId} value={m.organizationId}>
                  {m.organizationName}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>
    </Card>
  );
}

function OrganizationGate({ children }: { children: ReactNode }) {
  const { user, activeMembership } = useSession();
  const memberships = user?.memberships ?? [];

  if (!activeMembership) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <EmptyState
          icon={<Building aria-hidden="true" />}
          title="Choose an organization"
          description="Select the business account you want to work in."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {memberships.map((m) => (
                <Button key={m.organizationId} variant="secondary" onClick={() => setActiveOrganization(m.organizationId)}>
                  {m.organizationName}
                </Button>
              ))}
            </div>
          }
        />
      </div>
    );
  }

  return (
    <>
      <OrganizationStrip membership={activeMembership} memberships={memberships} />
      <div className="grid gap-6 lg:grid-cols-[208px_minmax(0,1fr)] lg:gap-8">
        {/* Offset clears the sticky site header (main row and category bar) on large screens. */}
        <aside className="lg:sticky lg:top-32 lg:self-start">
          <BusinessNav />
        </aside>
        {/* Remount the page when the active organization changes so no state leaks between tenants. */}
        <div key={activeMembership.organizationId} className="min-w-0">
          {children}
        </div>
      </div>
    </>
  );
}

/** Client shell for /business: session + membership guard, organization header and sub-navigation. */
export function BusinessShell({ children }: { children: ReactNode }) {
  return (
    <RequireAuth membership>
      <OrganizationGate>{children}</OrganizationGate>
    </RequireAuth>
  );
}
