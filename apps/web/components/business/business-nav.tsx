'use client';

import { Building, ClipboardList, FileText, LayoutDashboard, MapPin, Package, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cx } from '@/components/ui';

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/business', label: 'Overview', exact: true, icon: <LayoutDashboard aria-hidden="true" /> },
  { href: '/business/rfqs', label: 'RFQs', icon: <ClipboardList aria-hidden="true" /> },
  { href: '/business/quotations', label: 'Quotations', icon: <FileText aria-hidden="true" /> },
  { href: '/business/orders', label: 'Orders', icon: <Package aria-hidden="true" /> },
  { href: '/business/team', label: 'Team', icon: <Users aria-hidden="true" /> },
  { href: '/business/sites', label: 'Delivery sites', icon: <MapPin aria-hidden="true" /> },
  { href: '/business/company', label: 'Company', icon: <Building aria-hidden="true" /> },
];

export function BusinessNav() {
  const pathname = usePathname();
  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

  // Below `lg` the links scroll horizontally; the padding keeps their focus outlines from being clipped.
  return (
    <nav aria-label="Trade portal" className="-mx-4 overflow-x-auto px-4 py-1 sm:-mx-1 sm:px-1 lg:mx-0 lg:overflow-visible lg:p-0">
      <ul className="flex gap-1 lg:flex-col">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'flex items-center gap-2.5 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition-colors lg:rounded-lg lg:px-3 [&_svg]:size-4.5 [&_svg]:shrink-0',
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
    </nav>
  );
}
