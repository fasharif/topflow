'use client';

import { ORG_ROLE_LABELS, OrgStatus, type MembershipSummary } from '@topflow/shared';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { EmailVerificationNotice, ProfileCard } from '@/components/account/profile-card';
import { RecentOrders } from '@/components/account/recent-orders';
import { SecurityCard } from '@/components/account/security-card';
import { OrgStatusBadge } from '@/components/status-badge';
import { Alert, Card, LinkButton, PageHeader } from '@/components/ui';
import { useSession } from '@/lib/session';

function WelcomeBanner({ firstName }: { firstName: string }) {
  const params = useSearchParams();
  if (params.get('welcome') !== '1') return null;
  return (
    <Alert tone="success" title={`Welcome to Top Flow, ${firstName}!`}>
      Your account is ready. Browse the catalog, check out with payment on delivery, and follow every order right here.
    </Alert>
  );
}

function TradePortalCard({ memberships }: { memberships: MembershipSummary[] }) {
  return (
    <Card className="flex flex-col gap-4 border-brand-200 bg-brand-50/60 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-semibold text-ink-900">Trade account</p>
        <p className="mt-0.5 text-sm text-slate-600">Request quotations, manage approvals and track company orders in the trade portal.</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {memberships.map((membership) => (
            <li
              key={membership.organizationId}
              className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs text-slate-600 ring-1 ring-inset ring-slate-200"
            >
              <span className="font-medium text-ink-900">{membership.organizationName}</span>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              {ORG_ROLE_LABELS[membership.role]}
              {membership.organizationStatus !== OrgStatus.ACTIVE && <OrgStatusBadge status={membership.organizationStatus} />}
            </li>
          ))}
        </ul>
      </div>
      <LinkButton href="/business" className="shrink-0">
        Open trade portal
      </LinkButton>
    </Card>
  );
}

export default function AccountOverviewPage() {
  const { user } = useSession();
  // <RequireAuth> in the layout only renders account pages once the session is authenticated.
  if (!user) return null;

  const firstName = user.fullName.trim().split(/\s+/)[0] || user.fullName;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="My account" title={`Hello, ${firstName}`} description="Manage your profile, security settings and orders in one place." />

      <Suspense fallback={null}>
        <WelcomeBanner firstName={firstName} />
      </Suspense>

      {!user.emailVerified && <EmailVerificationNotice email={user.email} />}
      {user.memberships.length > 0 && <TradePortalCard memberships={user.memberships} />}

      <RecentOrders />

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <ProfileCard user={user} />
        <SecurityCard email={user.email} />
      </div>
    </div>
  );
}
