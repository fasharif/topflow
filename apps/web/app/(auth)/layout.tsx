import type { ReactNode } from 'react';
import { FlowLines } from '@/components/brand/flow-lines';
import { Logo } from '@/components/site-header';

const BENEFITS = [
  'Track online orders from confirmation to delivery',
  'Request quotations and approve them with your team',
  'Save delivery addresses and project sites',
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-ink-900 p-12 text-canvas lg:flex">
        <FlowLines className="pointer-events-none absolute inset-0 size-full text-brand-300" />
        <div className="relative">
          <Logo tone="paper" />
        </div>
        <div className="relative max-w-md">
          <p className="eyebrow text-brand-200">One Top Flow account</p>
          <p className="mt-5 font-display text-4xl font-light leading-tight">Online orders, trade quotations and deliveries, in one place.</p>
          <ul className="mt-8 space-y-3 text-sm text-canvas/75">
            {BENEFITS.map((benefit) => (
              <li key={benefit} className="flex gap-3">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-300" aria-hidden="true" />
                {benefit}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative font-mono text-[11px] uppercase tracking-[0.14em] text-canvas/50">Irrigation &amp; flow-control supply · UAE</p>
      </div>
      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-10 lg:hidden">
            <Logo />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
