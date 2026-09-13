'use client';

import { hasOrgPermission, toFils, type Fils, type OrgPermission } from '@topflow/shared';
import { useSession } from '@/lib/session';

/**
 * The active organization membership for trade-portal pages, plus a permission check used to
 * hide actions the member's role cannot perform. UX only — the API authorises every call.
 */
export function useOrg() {
  const session = useSession();
  const membership = session.activeMembership;
  const limit = membership?.approvalLimit ?? null;
  const approvalLimitFils: Fils | null = limit === null ? null : toFils(limit);
  return {
    user: session.user,
    membership,
    can: (permission: OrgPermission) => hasOrgPermission(membership?.role, permission),
    /** The member's personal spending limit in fils (`null` = no personal limit). */
    approvalLimitFils,
  };
}
