'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from '@/components/ui';
import { useSession } from '@/lib/session';

interface NavItem {
  href: string;
  label: string;
  /** Only highlight on an exact match (the overview would otherwise match every sub-page). */
  exact?: boolean;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: '/account',
    label: 'Overview',
    exact: true,
    icon: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5z',
  },
  {
    href: '/account/orders',
    label: 'Orders',
    icon: 'M21 7.5 12 3 3 7.5m18 0-9 4.5m9-4.5v9L12 21m0-9L3 7.5m9 4.5v9m-9-13.5v9L12 21',
  },
  {
    href: '/account/addresses',
    label: 'Addresses',
    icon: 'M12 21s-7-6.1-7-11.5a7 7 0 1 1 14 0C19 14.9 12 21 12 21zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  },
];

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
        <span className="size-10 animate-pulse rounded-full bg-slate-200" />
        <span className="space-y-1.5">
          <span className="block h-3 w-24 animate-pulse rounded bg-slate-200" />
          <span className="block h-2.5 w-32 animate-pulse rounded bg-slate-100" />
        </span>
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
        <span className="block truncate text-xs text-slate-500">{user.email}</span>
      </span>
    </div>
  );
}

/** Account sub-navigation: a horizontal tab strip on small screens, a sticky sidebar on large ones. */
export function AccountNav() {
  const pathname = usePathname();

  return (
    <aside className="lg:sticky lg:top-24 lg:self-start">
      <div className="mb-5 hidden lg:block">
        <SignedInAs />
      </div>
      <nav aria-label="Account">
        <ul className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xs lg:flex-col lg:p-2">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item);
            return (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition',
                    active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50 hover:text-ink-900',
                  )}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className={cx('size-4.5 shrink-0', active ? 'text-brand-600' : 'text-slate-400')}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d={item.icon} />
                  </svg>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
