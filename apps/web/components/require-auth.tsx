'use client';

import { hasPermission, isStaffRole, type Permission } from '@topflow/shared';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useSession } from '@/lib/session';
import { EmptyState, LinkButton, LoadingBlock } from './ui';

function currentLocation(fallback: string): string {
  return typeof window === 'undefined' ? fallback : `${window.location.pathname}${window.location.search}`;
}

/**
 * Client-side route guard for authenticated areas. It improves UX only — every API call is
 * authorised again by the API, which is the real security boundary. Staff whose account requires
 * two-factor authentication are sent to verify it before the back office loads.
 */
export function RequireAuth({
  children,
  permission,
  staff,
  membership,
}: {
  children: ReactNode;
  permission?: Permission;
  staff?: boolean;
  membership?: boolean;
}) {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const user = session.user;
  const needsSecondFactor =
    session.status === 'authenticated' &&
    user !== null &&
    Boolean(staff || permission) &&
    isStaffRole(user.role) &&
    user.mfaRequired &&
    user.assuranceLevel !== 'aal2';

  useEffect(() => {
    const here = encodeURIComponent(currentLocation(pathname));
    if (session.status === 'anonymous') router.replace(`/login?next=${here}`);
    else if (needsSecondFactor) router.replace(`/auth/mfa?next=${here}`);
  }, [session.status, needsSecondFactor, router, pathname]);

  if (session.status !== 'authenticated' || !user || needsSecondFactor) {
    return <LoadingBlock label="Checking your session…" />;
  }
  if ((staff && !isStaffRole(user.role)) || (permission && !hasPermission(user.role, permission))) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <EmptyState
          title="You don't have access to this area"
          description="Your account role does not include the permissions needed for this page."
          action={<LinkButton href="/">Back to the shop</LinkButton>}
        />
      </div>
    );
  }
  if (membership && user.memberships.length === 0) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <EmptyState
          title="No business account yet"
          description="Open a trade account to request quotations, get negotiated prices and buy on credit terms."
          action={<LinkButton href="/account/trade-account">Open a trade account</LinkButton>}
        />
      </div>
    );
  }
  return <>{children}</>;
}
