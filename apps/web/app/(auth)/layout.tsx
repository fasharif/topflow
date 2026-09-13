import Link from 'next/link';
import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-gradient-to-br from-ink-900 via-ink-800 to-brand-800 p-12 text-white lg:flex">
        <Link href="/" className="text-xl font-bold tracking-tight">
          TOP FLOW
        </Link>
        <div>
          <p className="text-3xl font-bold leading-tight">Irrigation &amp; flow control supplies for the UAE.</p>
          <p className="mt-4 max-w-md text-slate-300">
            One account for online orders, trade quotations, purchase approvals and delivery tracking.
          </p>
        </div>
        <p className="text-xs text-slate-400">www.topflow.ae</p>
      </div>
      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-8 block text-lg font-bold text-ink-900 lg:hidden">
            TOP FLOW
          </Link>
          {children}
        </div>
      </div>
    </div>
  );
}
