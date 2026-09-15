'use client';

import { isStaffRole } from '@topflow/shared';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import logoMark from '@/public/brand/logo-mark.png';
import { useCart } from '@/lib/cart';
import { COMPANY } from '@/lib/company';
import { applySession, setActiveOrganization, useSession } from '@/lib/session';
import { cx } from './ui';

export function Logo({ tone = 'ink' }: { tone?: 'ink' | 'paper' }) {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Top Flow home">
      <Image src={logoMark} alt="" width={36} height={36} priority className="size-9" />
      <span className={cx('text-[15px] font-bold tracking-[0.2em]', tone === 'paper' ? 'text-canvas' : 'text-ink-900')}>TOP FLOW</span>
    </Link>
  );
}

const NAV = [
  { href: '/products', label: 'Catalogue' },
  { href: '/quote', label: 'Request a quote' },
  { href: '/#why-top-flow', label: 'About' },
  { href: '/#contact', label: 'Contact' },
];

function BasketIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 9h16l-1.6 9.1a2 2 0 01-2 1.7H7.6a2 2 0 01-2-1.7L4 9z" strokeLinejoin="round" />
      <path d="M8.5 9l2-5M15.5 9l-2-5" strokeLinecap="round" />
    </svg>
  );
}

export function SiteHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const session = useSession();
  const { itemCount } = useCart();
  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const user = session.user;

  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => undefined);
    applySession(null);
    setMenuOpen(false);
    router.push('/');
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMenuOpen(false);
    router.push(search.trim() ? `/products?search=${encodeURIComponent(search.trim())}` : '/products');
  };

  const links = [
    ...NAV,
    ...(user && user.memberships.length > 0 ? [{ href: '/business', label: 'Trade portal' }] : []),
    ...(user && isStaffRole(user.role) ? [{ href: '/admin', label: 'Back office' }] : []),
  ];
  const isActive = (href: string) => !href.includes('#') && (pathname === href || pathname.startsWith(`${href}/`));

  const searchField = (id: string) => (
    <form role="search" onSubmit={submitSearch} className="relative w-full">
      <label htmlFor={id} className="sr-only">
        Search the catalogue
      </label>
      <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l4 4" strokeLinecap="round" />
      </svg>
      <input
        id={id}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search name, code, size…"
        className="h-10 w-full rounded-full border border-slate-300 bg-white pl-10 pr-4 text-sm text-ink-900 placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
      />
    </form>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-canvas/95 backdrop-blur">
      <div className="hidden bg-ink-900 text-canvas/80 md:block">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-1.5 text-xs sm:px-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em]">{COMPANY.tagline}</p>
          <div className="flex items-center gap-5">
            <a href={COMPANY.phoneHref} className="hover:text-canvas">
              {COMPANY.phone}
            </a>
            <a href={COMPANY.whatsappHref} target="_blank" rel="noopener noreferrer" className="hover:text-canvas">
              WhatsApp
            </a>
            <a href={`mailto:${COMPANY.email}`} className="hover:text-canvas">
              {COMPANY.email}
            </a>
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
        <Logo />

        <nav aria-label="Main" className="ml-6 hidden items-center gap-1 lg:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive(link.href) ? 'page' : undefined}
              className={cx(
                'rounded-full px-3 py-2 text-sm font-medium transition-colors',
                isActive(link.href) ? 'text-brand-600 underline decoration-2 underline-offset-8' : 'text-slate-700 hover:text-ink-900',
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden w-full max-w-xs xl:block">{searchField('site-search')}</div>

        <div className="ml-auto flex items-center gap-1.5 xl:ml-2">
          {user && user.memberships.length > 1 && (
            <select
              aria-label="Active organization"
              value={session.activeOrganizationId ?? ''}
              onChange={(event) => setActiveOrganization(event.target.value)}
              className="hidden h-9 max-w-44 rounded-full border border-slate-300 bg-white px-3 text-xs text-ink-900 lg:block"
            >
              {user.memberships.map((m) => (
                <option key={m.organizationId} value={m.organizationId}>
                  {m.organizationName}
                </option>
              ))}
            </select>
          )}

          {session.status === 'loading' ? (
            <span className="hidden w-20 sm:block" />
          ) : user ? (
            <div className="hidden items-center gap-1 sm:flex">
              <Link href="/account" className="rounded-full px-3 py-2 text-sm font-medium text-slate-700 hover:text-ink-900">
                {user.fullName.split(' ')[0]}
              </Link>
              <button type="button" onClick={signOut} className="rounded-full px-3 py-2 text-sm text-slate-500 hover:text-ink-900">
                Sign out
              </button>
            </div>
          ) : (
            <Link href="/login" className="hidden rounded-full px-3 py-2 text-sm font-medium text-slate-700 hover:text-ink-900 sm:block">
              Sign in
            </Link>
          )}

          <Link
            href="/cart"
            className="flex h-10 items-center gap-2 rounded-full border border-ink-900/20 bg-white px-4 text-sm font-medium text-ink-900 transition-colors hover:border-ink-900/45"
            aria-label={itemCount > 0 ? `Basket, ${itemCount} item${itemCount === 1 ? '' : 's'}` : 'Basket'}
          >
            <BasketIcon className="size-4" />
            <span className="hidden sm:inline">Basket</span>
            {itemCount > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-brand-600 px-1.5 text-xs font-semibold text-white">{itemCount}</span>}
          </Link>

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            className="grid size-10 place-items-center rounded-full text-ink-900 hover:bg-slate-100 lg:hidden"
          >
            <span className="sr-only">{menuOpen ? 'Close menu' : 'Open menu'}</span>
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              {menuOpen ? <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" /> : <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && (
        <div id="mobile-menu" className="border-t border-slate-200 bg-canvas lg:hidden">
          <div className="mx-auto max-w-7xl space-y-4 px-4 py-4 sm:px-6">
            {searchField('mobile-search')}
            <nav aria-label="Mobile" className="grid gap-1">
              {links.map((link) => (
                <Link key={link.href} href={link.href} onClick={() => setMenuOpen(false)} className="rounded-xl px-3 py-2.5 font-medium text-ink-900 hover:bg-slate-100">
                  {link.label}
                </Link>
              ))}
              {user ? (
                <>
                  <Link href="/account" onClick={() => setMenuOpen(false)} className="rounded-xl px-3 py-2.5 font-medium text-ink-900 hover:bg-slate-100">
                    My account
                  </Link>
                  <button type="button" onClick={signOut} className="rounded-xl px-3 py-2.5 text-left text-slate-600 hover:bg-slate-100">
                    Sign out
                  </button>
                </>
              ) : (
                <Link href="/login" onClick={() => setMenuOpen(false)} className="rounded-xl px-3 py-2.5 font-medium text-ink-900 hover:bg-slate-100">
                  Sign in
                </Link>
              )}
            </nav>
            <p className="text-sm text-slate-600">
              <a href={COMPANY.phoneHref} className="font-medium text-ink-900">
                {COMPANY.phone}
              </a>{' '}
              ·{' '}
              <a href={`mailto:${COMPANY.email}`} className="font-medium text-ink-900">
                {COMPANY.email}
              </a>
            </p>
          </div>
        </div>
      )}
    </header>
  );
}
