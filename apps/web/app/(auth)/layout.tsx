import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { FlowLines } from '@/components/brand/flow-lines';
import { Logo } from '@/components/brand/logo';
import { ServiceArea } from '@/components/contact-options';

const BENEFITS = [
  'Track online orders from confirmation to delivery',
  'Request quotations and approve them with your team',
  'Save delivery addresses and project sites',
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside data-surface="dark" className="relative isolate hidden flex-col justify-between overflow-hidden bg-ink-900 p-12 text-slate-300 lg:flex">
        <FlowLines className="pointer-events-none absolute inset-0 -z-10 size-full text-flow-300" />
        <Logo tone="inverse" />
        <div className="max-w-md">
          <p className="eyebrow text-brand-200">One TopFlow Hub account</p>
          <p className="heading-2 mt-4 text-white">Online orders, trade quotations and deliveries, in one place.</p>
          <ul className="mt-8 space-y-3 text-sm">
            {BENEFITS.map((benefit) => (
              <li key={benefit} className="flex gap-3">
                <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-200" />
                {benefit}
              </li>
            ))}
          </ul>
        </div>
        <ServiceArea tone="dark" className="text-xs" />
      </aside>
      <main id="main" className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-10 lg:hidden">
            <Logo />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
