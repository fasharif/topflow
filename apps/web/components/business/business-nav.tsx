'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from '@/components/ui';

interface NavItem {
  href: string;
  label: string;
  /** SVG path data for a 24×24 stroke icon. */
  icon: string;
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/business', label: 'Overview', exact: true, icon: 'M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z' },
  { href: '/business/rfqs', label: 'RFQs', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12h6M9 16h4' },
  { href: '/business/quotations', label: 'Quotations', icon: 'M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5zM14 3v5h5M9 13h6M9 17h4' },
  { href: '/business/orders', label: 'Orders', icon: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8' },
  { href: '/business/team', label: 'Team', icon: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75' },
  { href: '/business/sites', label: 'Delivery sites', icon: 'M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z' },
  { href: '/business/company', label: 'Company', icon: 'M3 21h18M5 21V5a2 2 0 012-2h6a2 2 0 012 2v16M15 21V9h4a2 2 0 012 2v10M9 7h2M9 11h2M9 15h2' },
];

function NavIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

export function BusinessNav() {
  const pathname = usePathname();
  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <nav aria-label="Trade portal" className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 lg:overflow-visible lg:pb-0">
      <ul className="flex gap-1 lg:flex-col">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition',
                  active
                    ? 'bg-white text-brand-700 shadow-xs ring-1 ring-slate-200'
                    : 'text-slate-600 hover:bg-white hover:text-ink-900',
                )}
              >
                <NavIcon path={item.icon} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
