'use client';

import { Building, LayoutDashboard, MapPin, Package, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Card, Skeleton, cx } from '@/components/ui';
import { useSession } from '@/lib/session';

interface NavItem {
  href: string;
  label: string;
  /** Only highlight on an exact match (the overview would otherwise match every sub-page). */
  exact?: boolean;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/account', label: 'Overview', exact: true, icon: LayoutDashboard },
  { href: '/account/orders', label: 'Orders', icon: Package },
  { href: '/account/addresses', label: 'Addresses', icon: MapPin },
];

/** Offered until the customer belongs to a company; members work in the trade portal instead. */
const TRADE_ACCOUNT_ITEM: NavItem = { href: '/account/trade-account', label: 'Trade account', icon: Building };

function isActive(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function SignedInAs() {
  const { user } = useSession();

  if (!user) {
    return (
      <div className="flex items-center gap-3" aria-hidden="true">
        {/* Drawn by hand: Skeleton's built-in radius would win over rounded-full. */}
        <span className="size-10 shrink-0 rounded-full bg-slate-200/80 motion-safe:animate-pulse" />
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-2.5 w-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ink-900 text-sm font-semibold text-white" aria-hidden="true">
        {initials(user.fullName)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink-900">{user.fullName}</span>
        <span className="block truncate text-xs text-slate-600">{user.email}</span>
      </span>
    </div>
  );
}

/** Account sub-navigation: a horizontal tab strip on small screens, a sticky sidebar (below the sticky site header) on large ones. */
export function AccountNav() {
  const pathname = usePathname();
  const { user } = useSession();
  const items = user && user.memberships.length === 0 ? [...NAV_ITEMS, TRADE_ACCOUNT_ITEM] : NAV_ITEMS;

  return (
    <aside className="lg:sticky lg:top-32 lg:self-start">
      <div className="mb-5 hidden lg:block">
        <SignedInAs />
      </div>
      <nav aria-label="Account">
        <Card>
          {/* The padding sits on the scrolling list so link focus outlines are not clipped. */}
          <ul className="flex gap-1 overflow-x-auto p-1 lg:flex-col lg:p-2">
            {items.map((item) => {
              const active = isActive(pathname, item);
              return (
                <li key={item.href} className="shrink-0">
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      active ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100 hover:text-ink-900',
                    )}
                  >
                    <item.icon aria-hidden="true" className={cx('size-4.5 shrink-0', active ? 'text-brand-600' : 'text-slate-500 group-hover:text-ink-900')} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      </nav>
    </aside>
  );
}
