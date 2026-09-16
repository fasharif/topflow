'use client';

import { isStaffRole } from '@topflow/shared';
import { Building, LayoutDashboard, LogIn, LogOut, Menu, Search, ShoppingBasket, UserRound, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Logo } from '@/components/brand/logo';
import { ContactOptions, ServiceArea } from '@/components/contact-options';
import { useCart } from '@/lib/cart';
import { setActiveOrganization, signOut, useSession } from '@/lib/session';
import { Container, IconButton, SearchInput, Select, cx } from './ui';

export { Logo } from './brand/logo';

interface NavLink {
  href: string;
  label: string;
  icon?: ReactNode;
}

const NAV: NavLink[] = [
  { href: '/products', label: 'Catalogue' },
  { href: '/quote', label: 'Request a quote' },
  { href: '/register?type=business', label: 'Trade accounts' },
  { href: '/#about', label: 'About' },
  { href: '/contact', label: 'Contact' },
];

function isActivePath(pathname: string, href: string): boolean {
  if (href.includes('#')) return false;
  const path = href.split('?')[0];
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function SiteHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const session = useSession();
  const { lines } = useCart();
  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPathname, setMenuPathname] = useState(pathname);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const user = session.user;
  const basketCount = lines.length;

  // Close the mobile menu whenever the route changes.
  if (menuPathname !== pathname) {
    setMenuPathname(pathname);
    setMenuOpen(false);
  }

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);

  const handleSignOut = async () => {
    setMenuOpen(false);
    await signOut();
    router.push('/');
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMenuOpen(false);
    const term = search.trim();
    router.push(term ? `/products?search=${encodeURIComponent(term)}` : '/products');
  };

  const workspaceLinks: NavLink[] = [
    ...(user && user.memberships.length > 0 ? [{ href: '/business', label: 'Trade portal', icon: <Building aria-hidden="true" /> }] : []),
    ...(user && isStaffRole(user.role) ? [{ href: '/admin', label: 'Back office', icon: <LayoutDashboard aria-hidden="true" /> }] : []),
  ];

  const basketLabel = basketCount > 0 ? `Basket, ${basketCount} ${basketCount === 1 ? 'product' : 'products'}` : 'Basket';

  const searchForm = (id: string, className: string) => (
    <form role="search" action="/products" onSubmit={submitSearch} className={cx('min-w-0 items-center gap-2', className)}>
      <label htmlFor={id} className="sr-only">
        Search the catalogue
      </label>
      <SearchInput
        id={id}
        name="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search products, SKUs or sizes…"
        enterKeyHint="search"
        className="flex-1"
      />
      <IconButton type="submit" label="Search" variant="primary">
        <Search aria-hidden="true" />
      </IconButton>
    </form>
  );

  const menuLink = (link: NavLink) => {
    const active = isActivePath(pathname, link.href);
    return (
      <li key={link.href}>
        <Link
          href={link.href}
          aria-current={active ? 'page' : undefined}
          onClick={() => setMenuOpen(false)}
          className={cx(
            'flex items-center gap-3 rounded-lg px-3 py-2.5 font-medium transition-colors [&_svg]:size-4.5 [&_svg]:shrink-0',
            active ? 'bg-brand-50 text-brand-800' : 'text-ink-900 hover:bg-slate-100',
          )}
        >
          {link.icon}
          {link.label}
        </Link>
      </li>
    );
  };

  return (
    <header className="sticky top-0 z-40 md:-top-9">
      <div data-surface="dark" className="hidden bg-ink-900 md:block">
        <Container className="flex h-9 items-center justify-between gap-6 text-xs">
          <ServiceArea tone="dark" />
          <ContactOptions tone="dark" size="sm" />
        </Container>
      </div>

      <div className="border-b border-slate-200 bg-white">
        <Container className="flex h-16 items-center gap-3 lg:gap-6">
          <Logo />

          {searchForm('site-search', 'hidden flex-1 lg:flex lg:max-w-xl xl:max-w-2xl')}

          <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
            {user && user.memberships.length > 1 && (
              <div className="hidden w-44 lg:block">
                <Select aria-label="Active organization" value={session.activeOrganizationId ?? ''} onChange={(event) => setActiveOrganization(event.target.value)}>
                  {user.memberships.map((membership) => (
                    <option key={membership.organizationId} value={membership.organizationId}>
                      {membership.organizationName}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            {session.status === 'loading' ? (
              <span className="hidden h-10 w-24 sm:block" aria-hidden="true" />
            ) : user ? (
              <>
                <Link
                  href="/account"
                  aria-current={isActivePath(pathname, '/account') ? 'page' : undefined}
                  className="hidden h-10 items-center gap-2 rounded-full px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-ink-900 sm:inline-flex"
                >
                  <UserRound aria-hidden="true" className="size-4.5" />
                  <span className="max-w-28 truncate">{user.fullName.split(' ')[0]}</span>
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="hidden h-10 cursor-pointer items-center gap-2 rounded-full px-3 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-ink-900 sm:inline-flex"
                >
                  <LogOut aria-hidden="true" className="size-4" />
                  Sign out
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="hidden h-10 items-center gap-2 rounded-full px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-ink-900 sm:inline-flex"
              >
                <LogIn aria-hidden="true" className="size-4" />
                Sign in
              </Link>
            )}

            <Link
              href="/cart"
              aria-label={basketLabel}
              aria-current={pathname === '/cart' ? 'page' : undefined}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-300 bg-white px-3.5 text-sm font-medium text-ink-900 shadow-xs transition-colors hover:border-slate-400 hover:bg-slate-50"
            >
              <ShoppingBasket aria-hidden="true" className="size-4.5" />
              <span className="hidden sm:inline">Basket</span>
              {basketCount > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1.5 text-xs font-semibold tabular-nums text-white">
                  {basketCount > 99 ? '99+' : basketCount}
                </span>
              )}
            </Link>

            <button
              ref={toggleRef}
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              className="grid size-10 cursor-pointer place-items-center rounded-full text-ink-900 transition-colors hover:bg-slate-100 lg:hidden"
            >
              <span className="sr-only">Menu</span>
              {menuOpen ? <X aria-hidden="true" className="size-5" /> : <Menu aria-hidden="true" className="size-5" />}
            </button>
          </div>
        </Container>

        <div className="hidden border-t border-slate-200 lg:block">
          <Container className="flex h-11 items-center justify-between gap-6">
            <nav aria-label="Main">
              <ul className="-ml-3 flex items-center">
                {NAV.map((link) => {
                  const active = isActivePath(pathname, link.href);
                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        aria-current={active ? 'page' : undefined}
                        className={cx(
                          'relative inline-flex h-11 items-center px-3 text-sm font-medium transition-colors',
                          active
                            ? 'text-brand-700 after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand-600'
                            : 'text-slate-700 hover:text-ink-900',
                        )}
                      >
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            {workspaceLinks.length > 0 && (
              <nav aria-label="Workspaces">
                <ul className="flex items-center gap-1">
                  {workspaceLinks.map((link) => {
                    const active = isActivePath(pathname, link.href);
                    return (
                      <li key={link.href}>
                        <Link
                          href={link.href}
                          aria-current={active ? 'page' : undefined}
                          className={cx(
                            'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors [&_svg]:size-4',
                            active ? 'bg-brand-50 text-brand-800' : 'text-slate-700 hover:bg-slate-100 hover:text-ink-900',
                          )}
                        >
                          {link.icon}
                          {link.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            )}
          </Container>
        </div>
      </div>

      <div id="mobile-menu" hidden={!menuOpen} className="border-b border-slate-200 bg-white shadow-raised lg:hidden">
        <Container className="max-h-[calc(100dvh-4rem)] space-y-5 overflow-y-auto py-4">
          {searchForm('mobile-search', 'flex')}

          <nav aria-label="Menu">
            <ul className="grid gap-0.5">{[...NAV, ...workspaceLinks].map(menuLink)}</ul>
          </nav>

          <div className="grid gap-0.5 border-t border-slate-200 pt-4">
            {user ? (
              <>
                <p className="px-3 pb-2 text-sm text-slate-600">
                  Signed in as <span className="font-medium text-ink-900">{user.fullName}</span>
                </p>
                {user.memberships.length > 1 && (
                  <div className="px-3 pb-3">
                    <label htmlFor="mobile-organization" className="mb-1.5 block text-sm font-medium text-ink-900">
                      Active organization
                    </label>
                    <Select id="mobile-organization" value={session.activeOrganizationId ?? ''} onChange={(event) => setActiveOrganization(event.target.value)}>
                      {user.memberships.map((membership) => (
                        <option key={membership.organizationId} value={membership.organizationId}>
                          {membership.organizationName}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
                <ul className="grid gap-0.5">{menuLink({ href: '/account', label: 'My account', icon: <UserRound aria-hidden="true" /> })}</ul>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-ink-900"
                >
                  <LogOut aria-hidden="true" className="size-4.5" />
                  Sign out
                </button>
              </>
            ) : session.status === 'loading' ? null : (
              <ul className="grid gap-0.5">{menuLink({ href: '/login', label: 'Sign in', icon: <LogIn aria-hidden="true" /> })}</ul>
            )}
          </div>

          <div className="rounded-xl bg-slate-50 p-4">
            <p className="eyebrow text-slate-600">Talk to sales</p>
            <ContactOptions layout="column" className="mt-3" />
            <ServiceArea className="mt-3 text-sm" />
          </div>
        </Container>
      </div>
    </header>
  );
}
