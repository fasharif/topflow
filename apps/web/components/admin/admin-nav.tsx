'use client';

import { Permission, ROLE_LABELS, hasPermission } from '@topflow/shared';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from '@/components/ui';
import { useSession } from '@/lib/session';

interface NavItem {
  href: string;
  label: string;
  permission: Permission;
  /** 24×24 stroke icon path. */
  icon: string;
}

const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Overview',
    items: [{ href: '/admin', label: 'Dashboard', permission: Permission.DASHBOARD_VIEW, icon: 'M4 5h7v6H4zM13 5h7v3h-7zM13 10h7v9h-7zM4 13h7v6H4z' }],
  },
  {
    label: 'Sales & fulfilment',
    items: [
      { href: '/admin/orders', label: 'Orders', permission: Permission.ORDERS_READ_ALL, icon: 'M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7M12 11v10' },
      { href: '/admin/rfqs', label: 'RFQs', permission: Permission.RFQS_MANAGE, icon: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4' },
      { href: '/admin/quotations', label: 'Quotations', permission: Permission.QUOTATIONS_MANAGE, icon: 'M6 3h9l3 3v15H6zM9 9h6M9 13h6M9 17h3' },
    ],
  },
  {
    label: 'Customers',
    items: [
      { href: '/admin/organizations', label: 'Organizations', permission: Permission.ORGANIZATIONS_REVIEW, icon: 'M4 21V5l8-2v18M12 8l8 2v11M8 8h1M8 12h1M8 16h1M15 13h2M15 17h2M3 21h18' },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { href: '/admin/products', label: 'Products', permission: Permission.CATALOG_WRITE, icon: 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM4 7.5l8 4.5 8-4.5M12 12v9' },
      { href: '/admin/categories', label: 'Categories', permission: Permission.CATALOG_WRITE, icon: 'M4 6h6l2 2h8v11H4z' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { href: '/admin/users', label: 'Users', permission: Permission.USERS_MANAGE, icon: 'M16 19v-1a4 4 0 00-4-4H8a4 4 0 00-4 4v1M10 10a3 3 0 100-6 3 3 0 000 6zM20 19v-1a3 3 0 00-2-2.8M15 4.2a3 3 0 010 5.6' },
      { href: '/admin/audit', label: 'Audit log', permission: Permission.AUDIT_READ, icon: 'M9 4h6v3H9zM7 5H5v16h14V5h-2M9 13l2 2 4-4' },
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

function NavIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
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
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink-900 text-xs font-semibold text-white" aria-hidden="true">
          {initials(user.fullName)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-900">{user.fullName}</p>
          <p className="text-xs text-slate-500">{ROLE_LABELS[user.role]} · Back office</p>
        </div>
      </div>

      {/* Small screens: one scrollable row of pills. */}
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:hidden">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium',
                  active ? 'border-ink-900 bg-ink-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:text-ink-900',
                )}
              >
                <NavIcon path={item.icon} />
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
            <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cx(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                        active ? 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200' : 'text-slate-600 hover:bg-white hover:text-ink-900',
                      )}
                    >
                      <NavIcon path={item.icon} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        <Link href="/" className="block px-3 text-xs font-medium text-slate-500 hover:text-brand-700">
          ← Back to the storefront
        </Link>
      </div>
    </nav>
  );
}
