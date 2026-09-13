'use client';

import { hasPermission, isStaffRole, type Permission } from '@topflow/shared';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useSession } from '@/lib/session';
import { EmptyState, LinkButton, LoadingBlock } from './ui';

/**
 * Client-side route guard for authenticated areas. It improves UX only — every API call is
 * authorised again on the server, which is the real security boundary.
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

  useEffect(() => {
    if (session.status === 'anonymous') {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [session.status, router, pathname]);

  if (session.status !== 'authenticated' || !session.user) {
    return <LoadingBlock label="Checking your session…" />;
  }
  if ((staff && !isStaffRole(session.user.role)) || (permission && !hasPermission(session.user.role, permission))) {
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
  if (membership && session.user.memberships.length === 0) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <EmptyState
          title="No business account yet"
          description="Open a trade account to request quotations, get negotiated prices and buy on credit terms."
          action={<LinkButton href="/register?type=business">Open a trade account</LinkButton>}
        />
      </div>
    );
  }
  return <>{children}</>;
}
