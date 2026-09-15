import Link from 'next/link';
import { COMPANY, MAIN_CATEGORIES } from '@/lib/company';
import { Logo } from './site-header';

const CUSTOMER_LINKS = [
  { href: '/quote', label: 'Request a quotation' },
  { href: '/register?type=business', label: 'Open a trade account' },
  { href: '/account/orders', label: 'Track your orders' },
  { href: '/login', label: 'Sign in' },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 bg-ink-900 text-canvas/75">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <Logo tone="paper" />
          <p className="mt-5 max-w-sm text-sm leading-relaxed">
            A UAE trading company run by people with decades in irrigation, supplying contractors, landscapers, facilities teams and homeowners from
            one catalogue.
          </p>
          <ul className="mt-6 space-y-2 text-sm">
            <li>
              <a href={COMPANY.phoneHref} className="text-canvas hover:underline">
                {COMPANY.phone}
              </a>
            </li>
            <li>
              <a href={COMPANY.whatsappHref} target="_blank" rel="noopener noreferrer" className="text-canvas hover:underline">
                Chat on WhatsApp
              </a>
            </li>
            <li>
              <a href={`mailto:${COMPANY.email}`} className="text-canvas hover:underline">
                {COMPANY.email}
              </a>
            </li>
          </ul>
        </div>

        <div>
          <p className="eyebrow text-brand-200">Catalogue</p>
          <ul className="mt-4 space-y-2 text-sm">
            {MAIN_CATEGORIES.map((category) => (
              <li key={category.slug}>
                <Link href={`/products?category=${category.slug}`} className="hover:text-canvas">
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="eyebrow text-brand-200">Customers</p>
          <ul className="mt-4 space-y-2 text-sm">
            {CUSTOMER_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-canvas">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="eyebrow text-brand-200">Good to know</p>
          <ul className="mt-4 space-y-2 text-sm">
            <li>Prices shown to consumers include 5% VAT</li>
            <li>Free delivery on retail orders over AED 500</li>
            <li>Cash or card on delivery</li>
            <li>Formal PDF quotations for projects</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-7xl px-4 py-5 font-mono text-[11px] uppercase tracking-[0.14em] text-canvas/50 sm:px-6">
          © {new Date().getFullYear()} Top Flow · Dubai, United Arab Emirates · {COMPANY.website}
        </p>
      </div>
    </footer>
  );
}
