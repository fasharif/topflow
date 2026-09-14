import type { CategoryDto, Paginated, ProductDto } from '@topflow/shared';
import Link from 'next/link';
import { connection } from 'next/server';
import { FlowLines } from '@/components/brand/flow-lines';
import { ProductCard, ProductImage } from '@/components/catalog/product-card';
import { LinkButton } from '@/components/ui';
import { COMPANY } from '@/lib/company';
import { serverApi } from '@/lib/server-api';

const WHY = [
  {
    title: 'Specialist product knowledge',
    body: 'The range is chosen by people who have sized systems and specified materials on real projects, not by a catalogue algorithm.',
  },
  {
    title: 'Ready stock for quick dispatch',
    body: 'Fast-moving fittings and lines are held on the shelf in the UAE, so urgent jobs are not left waiting on shipments.',
  },
  {
    title: 'The whole system from one supplier',
    body: 'From HDPE mains and electrofusion fittings to rotors, drippers and valve boxes: one basket, one quotation, one delivery.',
  },
  {
    title: 'Transparent, enquiry-friendly pricing',
    body: 'Every item shows an indicative price range. Buy online, or send your basket for a formal quotation at project prices.',
  },
];

const STEPS = [
  { title: 'Browse the catalogue', body: 'Search by name, code or size across nine categories of irrigation and flow-control products.' },
  { title: 'Build your basket', body: 'Add what the job needs. Indicative prices are shown per unit and include 5% VAT.' },
  { title: 'Check out or request a quote', body: 'Pay on delivery for everyday orders, or send the basket to our sales team for a formal PDF quotation.' },
  { title: 'Delivered across the UAE', body: 'Free delivery on retail orders over AED 500. Project deliveries are scheduled to site.' },
];

type HomeData = [CategoryDto[], Paginated<ProductDto> | null, Paginated<ProductDto> | null];

export default async function HomePage() {
  await connection();
  const [categories, ready, everything]: HomeData = await Promise.all([
    serverApi<CategoryDto[]>('/catalog/categories', { revalidate: 300 }).catch((): CategoryDto[] => []),
    serverApi<Paginated<ProductDto>>('/catalog/products', {
      searchParams: new URLSearchParams({ pageSize: '8', sort: 'name', stockStatus: 'IN_STOCK' }),
      revalidate: 120,
    }).catch(() => null),
    serverApi<Paginated<ProductDto>>('/catalog/products', { searchParams: new URLSearchParams({ pageSize: '1' }), revalidate: 300 }).catch(() => null),
  ]);

  const topLevel = categories.filter((category) => category.parentId === null && (category.productCount ?? 0) > 0);
  const collage = topLevel.filter((category) => category.imageUrl).slice(0, 4);
  const stats = [
    { value: everything?.total, label: 'Products listed' },
    { value: ready?.total, label: 'Ready-stock items' },
    { value: topLevel.length, label: 'Categories' },
  ].filter((stat) => (stat.value ?? 0) > 0);

  return (
    <>
      <section className="relative overflow-hidden border-b border-slate-200">
        <FlowLines className="pointer-events-none absolute inset-0 size-full text-brand-600" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 py-16 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:py-24">
          <div>
            <p className="eyebrow text-brand-600">Top Flow — irrigation &amp; flow-control supply, UAE</p>
            <h1 className="mt-6 font-display text-5xl font-light leading-[1.03] tracking-tight text-ink-900 sm:text-6xl xl:text-7xl">
              Irrigation supply, <em className="text-brand-600">specified</em> by people who know the field.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
              Fittings, sprinklers, drip lines, valves and filters for contractors, landscapers, facilities teams and homeowners. Buy online at
              transparent prices, or send your basket for a formal quotation.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <LinkButton href="/products" size="lg">
                Browse the catalogue
              </LinkButton>
              <LinkButton href="/quote" size="lg" variant="secondary">
                Request a quote
              </LinkButton>
            </div>
            {stats.length > 0 && (
              <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-slate-200 pt-6">
                {stats.map((stat) => (
                  <div key={stat.label}>
                    <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">{stat.label}</dt>
                    <dd className="mt-1 font-display text-4xl text-ink-900">{stat.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          {collage.length === 4 && (
            <div className="grid grid-cols-2 gap-4" aria-hidden="true">
              {collage.map((category, index) => (
                <div
                  key={category.id}
                  className={`aspect-square overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_60px_-40px_rgba(18,33,27,0.5)] ${index % 2 === 1 ? 'translate-y-8' : ''}`}
                >
                  <ProductImage product={{ imageUrl: category.imageUrl, name: category.name }} className="size-full object-contain p-6" />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {topLevel.length > 0 && (
        <div className="overflow-hidden border-b border-slate-200 bg-white py-4" aria-hidden="true">
          <div className="flex w-max animate-marquee gap-10 whitespace-nowrap motion-reduce:animate-none">
            {[...topLevel, ...topLevel].map((category, index) => (
              <span key={`${category.id}-${index}`} className="flex items-center gap-10 font-mono text-xs uppercase tracking-[0.18em] text-slate-600">
                {category.name}
                <span className="text-brand-500">✦</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {topLevel.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="eyebrow text-brand-600">01 — What we supply</p>
              <h2 className="mt-3 font-display text-4xl tracking-tight text-ink-900 sm:text-5xl">
                {topLevel.length} categories, one catalogue.
              </h2>
            </div>
            <Link href="/products" className="font-medium text-brand-600 hover:underline">
              See all {everything?.total ?? ''} items →
            </Link>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {topLevel.map((category, index) => (
              <Link
                key={category.id}
                href={`/products?category=${category.slug}`}
                className="group flex overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_18px_40px_-26px_rgba(18,33,27,0.5)]"
              >
                <div className="w-32 shrink-0 border-r border-slate-100 bg-white sm:w-36">
                  <ProductImage product={{ imageUrl: category.imageUrl, name: category.name }} className="size-full object-contain p-4 transition duration-300 group-hover:scale-105" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col p-5">
                  <p className="font-mono text-[11px] text-slate-500">{String(index + 1).padStart(2, '0')}</p>
                  <h3 className="mt-1 font-display text-xl leading-snug text-ink-900 group-hover:text-brand-600">{category.name}</h3>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-600">{category.description}</p>
                  <p className="mt-auto pt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-brand-600">{category.productCount} items →</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {ready && ready.items.length > 0 && (
        <section className="border-y border-slate-200 bg-white/60">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="eyebrow text-brand-600">02 — Ready stock</p>
                <h2 className="mt-3 font-display text-4xl tracking-tight text-ink-900 sm:text-5xl">On the shelf, ready to go.</h2>
              </div>
              <Link href="/products?stockStatus=IN_STOCK" className="font-medium text-brand-600 hover:underline">
                All {ready.total} ready-stock items →
              </Link>
            </div>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {ready.items.map((product) => (
                <ProductCard key={product.id} product={product} trade={false} />
              ))}
            </div>
          </div>
        </section>
      )}

      <section id="why-top-flow" className="mx-auto grid max-w-7xl scroll-mt-32 gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="eyebrow text-brand-600">03 — Why Top Flow</p>
          <h2 className="mt-3 font-display text-4xl tracking-tight text-ink-900 sm:text-5xl">A new name, built on decades in irrigation.</h2>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-slate-600">
            Top Flow is led by people who have specified, sourced and supplied irrigation projects across the region for years. We work
            enquiry-first: tell us what the project needs and we quote it properly.
          </p>
        </div>
        <ol className="grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-2">
          {WHY.map((item, index) => (
            <li key={item.title} className="bg-white p-7">
              <p className="font-mono text-[11px] text-brand-600">{String(index + 1).padStart(2, '0')}</p>
              <h3 className="mt-3 font-display text-xl text-ink-900">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-slate-200 bg-white/60">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <p className="eyebrow text-brand-600">04 — How it works</p>
          <h2 className="mt-3 font-display text-4xl tracking-tight text-ink-900 sm:text-5xl">From basket to site in four steps.</h2>
          <ol className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="border-t border-ink-900/15 pt-6">
                <p className="font-display text-5xl font-light text-brand-600">{index + 1}</p>
                <h3 className="mt-4 font-semibold text-ink-900">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl bg-ink-900 px-8 py-14 text-canvas sm:px-14">
          <FlowLines className="pointer-events-none absolute inset-0 size-full text-brand-300" />
          <div className="relative grid gap-10 lg:grid-cols-[1.3fr_1fr] lg:items-end">
            <div>
              <p className="eyebrow text-brand-200">For contractors, landscapers &amp; facilities teams</p>
              <h2 className="mt-4 font-display text-4xl font-light leading-tight sm:text-5xl">Trade accounts with project pricing, approvals and credit terms.</h2>
            </div>
            <div>
              <ul className="space-y-2 text-sm text-canvas/75">
                <li>Negotiated trade prices applied across the catalogue</li>
                <li>Requests for quotation, revisions and PDF quotations</li>
                <li>Spending limits and approvers for your buying team</li>
                <li>Delivery sites, order tracking and credit terms</li>
              </ul>
              <div className="mt-7 flex flex-wrap gap-3">
                <LinkButton href="/register?type=business" size="lg" className="bg-canvas text-ink-900 hover:bg-white">
                  Open a trade account
                </LinkButton>
                <LinkButton href="/login" size="lg" variant="ghost" className="text-canvas hover:bg-white/10 hover:text-canvas">
                  Sign in
                </LinkButton>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="contact" className="mx-auto max-w-7xl scroll-mt-32 px-4 pb-8 sm:px-6">
        <div className="grid gap-10 border-t border-slate-200 pt-16 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="eyebrow text-brand-600">Get in touch</p>
            <h2 className="mt-3 font-display text-4xl tracking-tight text-ink-900 sm:text-5xl">Tell us what your project needs.</h2>
            <p className="mt-5 max-w-md text-slate-600">Send a quote request from your basket, or speak to our team directly.</p>
            <LinkButton href="/quote" size="lg" className="mt-8">
              Request a quote
            </LinkButton>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: 'Call', value: COMPANY.phone, href: COMPANY.phoneHref, external: false },
              { label: 'WhatsApp', value: 'Chat with sales', href: COMPANY.whatsappHref, external: true },
              { label: 'Email', value: COMPANY.email, href: `mailto:${COMPANY.email}`, external: false },
            ].map((channel) => (
              <a
                key={channel.label}
                href={channel.href}
                {...(channel.external && { target: '_blank', rel: 'noopener noreferrer' })}
                className="group rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-brand-500"
              >
                <p className="eyebrow text-slate-500">{channel.label}</p>
                <p className="mt-3 break-words font-medium text-ink-900 group-hover:text-brand-600">{channel.value}</p>
              </a>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
