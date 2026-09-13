'use client';

import { isStaffRole } from '@topflow/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useCart } from '@/lib/cart';
import { applySession, setActiveOrganization, useSession } from '@/lib/session';
import { cx } from './ui';

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Top Flow home">
      <span className="grid size-9 place-items-center rounded-lg bg-brand-600 text-white shadow-sm">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M12 3c-3 4-6 7.5-6 11a6 6 0 0012 0c0-3.5-3-7-6-11z" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="leading-tight">
        <span className="block text-lg font-bold tracking-tight text-white">TOP FLOW</span>
        <span className="hidden text-[11px] text-slate-300 sm:block">Irrigation &amp; Flow Control Supplies</span>
      </span>
    </Link>
  );
}

export function SiteHeader() {
  const router = useRouter();
  const session = useSession();
  const { itemCount } = useCart();
  const [search, setSearch] = useState('');
  const user = session.user;

  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => undefined);
    applySession(null);
    router.push('/');
  };

  return (
    <header className="sticky top-0 z-30 bg-ink-900 shadow-sm">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
        <Logo />

        <form
          className="ml-2 hidden flex-1 md:block"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            router.push(search.trim() ? `/products?search=${encodeURIComponent(search.trim())}` : '/products');
          }}
        >
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search sprinklers, drip lines, valves, SKUs…"
            aria-label="Search products"
            className="h-10 w-full max-w-xl rounded-lg border border-white/10 bg-white/10 px-4 text-sm text-white placeholder:text-slate-400 focus:border-brand-500 focus:bg-white/15 focus:outline-none"
          />
        </form>

        <nav className="ml-auto flex items-center gap-1 text-sm">
          <Link href="/products" className="rounded-lg px-3 py-2 text-slate-200 hover:bg-white/10 hover:text-white">
            Products
          </Link>

          {user && user.memberships.length > 0 && (
            <Link href="/business" className="rounded-lg px-3 py-2 text-slate-200 hover:bg-white/10 hover:text-white">
              Trade portal
            </Link>
          )}
          {user && isStaffRole(user.role) && (
            <Link href="/admin" className="rounded-lg px-3 py-2 text-slate-200 hover:bg-white/10 hover:text-white">
              Back office
            </Link>
          )}

          {user && user.memberships.length > 1 && (
            <select
              aria-label="Active organization"
              value={session.activeOrganizationId ?? ''}
              onChange={(event) => setActiveOrganization(event.target.value)}
              className="ml-1 hidden h-9 max-w-44 rounded-lg border border-white/10 bg-white/10 px-2 text-xs text-white lg:block"
            >
              {user.memberships.map((m) => (
                <option key={m.organizationId} value={m.organizationId} className="text-ink-900">
                  {m.organizationName}
                </option>
              ))}
            </select>
          )}

          {session.status === 'loading' ? (
            <span className="w-24" />
          ) : user ? (
            <div className="flex items-center gap-1">
              <Link href="/account" className="rounded-lg px-3 py-2 text-slate-200 hover:bg-white/10 hover:text-white">
                {user.fullName.split(' ')[0]}
              </Link>
              <button type="button" onClick={signOut} className="rounded-lg px-3 py-2 text-slate-400 hover:bg-white/10 hover:text-white">
                Sign out
              </button>
            </div>
          ) : (
            <Link href="/login" className="rounded-lg px-3 py-2 font-medium text-white hover:bg-white/10">
              Sign in
            </Link>
          )}

          <Link
            href="/cart"
            className={cx('relative ml-1 flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 font-medium text-white hover:bg-brand-700')}
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M3 4h2l2.4 11.2a2 2 0 002 1.6h7.7a2 2 0 002-1.5L21 8H6" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="10" cy="20" r="1.2" />
              <circle cx="17" cy="20" r="1.2" />
            </svg>
            Cart
            {itemCount > 0 && (
              <span className="grid min-w-5 place-items-center rounded-full bg-white px-1.5 text-xs font-bold text-brand-700">{itemCount}</span>
            )}
          </Link>
        </nav>
      </div>
    </header>
  );
}
