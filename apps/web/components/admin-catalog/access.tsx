'use client';

import { ROLE_LABELS, hasPermission, type Permission } from '@topflow/shared';
import { ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { EmptyState, LinkButton, LoadingBlock } from '@/components/ui';
import { useSession } from '@/lib/session';

/**
 * Per-page permission check. The admin layout only verifies that the user is staff, while each
 * back-office area needs a specific permission. UX only: the API enforces the same matrix.
 */
export function RequirePermission({ permission, area, children }: { permission: Permission; area: string; children: ReactNode }) {
  const { status, user } = useSession();

  if (status === 'loading' || !user) return <LoadingBlock label="Checking your access…" />;
  if (!hasPermission(user.role, permission)) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <EmptyState
          icon={<ShieldAlert aria-hidden="true" />}
          title="Access restricted"
          description={`${area} is not available to the ${ROLE_LABELS[user.role]} role. Ask a Top Flow administrator if you need access.`}
          action={
            <LinkButton href="/admin" variant="secondary">
              Back to the dashboard
            </LinkButton>
          }
        />
      </div>
    );
  }
  return <>{children}</>;
}

/** Whether the signed-in user holds a platform permission (for hiding individual actions). */
export function useCan(permission: Permission): boolean {
  const { user } = useSession();
  return hasPermission(user?.role, permission);
}
