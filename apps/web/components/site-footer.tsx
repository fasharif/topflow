import { Check } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/logo';
import { ContactOptions, ServiceArea } from '@/components/contact-options';
import { COMPANY, MAIN_CATEGORIES } from '@/lib/company';
import { FREE_DELIVERY_LABEL, VAT_LABEL } from '@/lib/format';
import { Container } from './ui';

const CUSTOMER_LINKS = [
  { href: '/quote', label: 'Request a quote' },
  { href: '/contact', label: 'Contact' },
  { href: '/register?type=business', label: 'Open a trade account' },
  { href: '/account/orders', label: 'Track orders' },
  { href: '/login', label: 'Sign in' },
];

const FACTS = [
  `Consumer prices include ${VAT_LABEL} VAT`,
  `Free delivery on retail orders over ${FREE_DELIVERY_LABEL}`,
  'Cash or card on delivery',
  'Formal PDF quotations for projects',
  'Trade accounts with purchase approvals and credit terms',
];

const linkClass = 'rounded-sm text-slate-300 transition-colors hover:text-white';

function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="eyebrow text-brand-200">{title}</h2>
      <ul className="mt-4 space-y-2.5">{children}</ul>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer data-surface="dark" className="bg-ink-950 text-sm text-slate-300">
      <Container className="grid gap-12 py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16">
        <div>
          <Logo tone="inverse" />
          <p className="mt-5 max-w-sm leading-relaxed">
            {COMPANY.productName} is {COMPANY.name}’s supply platform for irrigation and flow-control products, for contractors, farms, landscapers,
            facilities teams and homeowners.
          </p>
          <div className="mt-6 space-y-3">
            <ContactOptions tone="dark" layout="column" />
            <ServiceArea tone="dark" />
          </div>
        </div>

        <div className="grid gap-10 sm:grid-cols-3">
          <FooterColumn title="Catalogue">
            {MAIN_CATEGORIES.map((category) => (
              <li key={category.slug}>
                <Link href={`/products?category=${category.slug}`} className={linkClass}>
                  {category.name}
                </Link>
              </li>
            ))}
          </FooterColumn>
          <FooterColumn title="Customers">
            {CUSTOMER_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={linkClass}>
                  {link.label}
                </Link>
              </li>
            ))}
          </FooterColumn>
          <FooterColumn title="Good to know">
            {FACTS.map((fact) => (
              <li key={fact} className="flex gap-2.5">
                <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-200" />
                {fact}
              </li>
            ))}
          </FooterColumn>
        </div>
      </Container>

      <div className="border-t border-white/10">
        <Container className="flex flex-col gap-2 py-5 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {COMPANY.name} · {COMPANY.country}
          </p>
          <p>
            <span className="font-medium text-slate-300">{COMPANY.productName}</span> ·{' '}
            <a href={COMPANY.websiteUrl} className={linkClass}>
              {COMPANY.website}
            </a>
          </p>
        </Container>
      </div>
    </footer>
  );
}
