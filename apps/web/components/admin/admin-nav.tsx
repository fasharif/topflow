'use client';

import { Permission, ROLE_LABELS, hasPermission } from '@topflow/shared';
import { Boxes, Building, ClipboardList, FileText, FolderTree, LayoutDashboard, Package, ScrollText, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { BackLink, Card, cx } from '@/components/ui';
import { useSession } from '@/lib/session';

interface NavItem {
  href: string;
  label: string;
  permission: Permission;
  /** Decorative Lucide icon element. */
  icon: ReactNode;
}

const ICON = 'size-4.5 shrink-0';

const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Overview',
    items: [{ href: '/admin', label: 'Dashboard', permission: Permission.DASHBOARD_VIEW, icon: <LayoutDashboard aria-hidden="true" className={ICON} /> }],
  },
  {
    label: 'Sales & fulfilment',
    items: [
      { href: '/admin/orders', label: 'Orders', permission: Permission.ORDERS_READ_ALL, icon: <Package aria-hidden="true" className={ICON} /> },
      { href: '/admin/rfqs', label: 'RFQs', permission: Permission.RFQS_MANAGE, icon: <ClipboardList aria-hidden="true" className={ICON} /> },
      { href: '/admin/quotations', label: 'Quotations', permission: Permission.QUOTATIONS_MANAGE, icon: <FileText aria-hidden="true" className={ICON} /> },
    ],
  },
  {
    label: 'Customers',
    items: [
      { href: '/admin/organizations', label: 'Organizations', permission: Permission.ORGANIZATIONS_REVIEW, icon: <Building aria-hidden="true" className={ICON} /> },
    ],
  },
  {
    label: 'Catalogue',
    items: [
      { href: '/admin/products', label: 'Products', permission: Permission.CATALOG_WRITE, icon: <Boxes aria-hidden="true" className={ICON} /> },
      { href: '/admin/categories', label: 'Categories', permission: Permission.CATALOG_WRITE, icon: <FolderTree aria-hidden="true" className={ICON} /> },
    ],
  },
  {
    label: 'Administration',
    items: [
      { href: '/admin/users', label: 'Users', permission: Permission.USERS_MANAGE, icon: <Users aria-hidden="true" className={ICON} /> },
      { href: '/admin/audit', label: 'Audit log', permission: Permission.AUDIT_READ, icon: <ScrollText aria-hidden="true" className={ICON} /> },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  return href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`);
}

function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

/** Staff navigation, filtered by the signed-in user's role permissions. */
export function AdminNav() {
  const pathname = usePathname();
  const { user } = useSession();
  if (!user) return null;

  const groups = NAV_GROUPS.map((group) => ({ ...group, items: group.items.filter((item) => hasPermission(user.role, item.permission)) })).filter(
    (group) => group.items.length > 0,
  );
  const items = groups.flatMap((group) => group.items);

  return (
    <nav aria-label="Back office" className="mb-6 lg:mb-0">
      <Card className="mb-4 flex items-center gap-3 p-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink-900 text-xs font-semibold text-white" aria-hidden="true">
          {initials(user.fullName)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-900">{user.fullName}</p>
          <p className="text-xs text-slate-600">{ROLE_LABELS[user.role]} · Back office</p>
        </div>
      </Card>

      {/* Small screens: one scrollable row of pills; the vertical padding keeps focus outlines from being clipped. */}
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1 sm:-mx-6 sm:px-6 lg:hidden">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors',
                  active ? 'border-brand-200 bg-brand-50 text-brand-800' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:text-ink-900',
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Large screens: grouped sidebar. */}
      <div className="hidden space-y-5 lg:block">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="eyebrow mb-2 px-3 text-slate-600">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cx(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        active ? 'bg-brand-50 text-brand-800 ring-1 ring-brand-200 ring-inset' : 'text-slate-700 hover:bg-white hover:text-ink-900',
                      )}
                    >
                      {item.icon}
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        <BackLink href="/" className="px-3">
          Back to the storefront
        </BackLink>
      </div>
    </nav>
  );
}
