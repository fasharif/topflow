import type { CategoryDto, Paginated, ProductDto } from '@topflow/shared';
import {
  ArrowRight,
  BadgePercent,
  Banknote,
  Building,
  ClipboardList,
  CreditCard,
  FileText,
  PackageCheck,
  Receipt,
  Send,
  ShieldCheck,
  Truck,
  Users,
} from 'lucide-react';
import Form from 'next/form';
import Link from 'next/link';
import { connection } from 'next/server';
import { FlowLines } from '@/components/brand/flow-lines';
import { CategoryIcon } from '@/components/catalog/category-icon';
import { ProductCard, ProductImage } from '@/components/catalog/product-card';
import { CompanyLocation, ContactOptions } from '@/components/contact-options';
import { Button, Container, LinkButton, SearchInput, Section, SectionHeading } from '@/components/ui';
import { COMPANY } from '@/lib/company';
import { FREE_DELIVERY_LABEL, VAT_LABEL, pluralize } from '@/lib/format';
import { serverApi } from '@/lib/server-api';

/** Only claims that are true of the platform today. */
const TRUST_POINTS = [
  {
    title: 'Prices include VAT',
    body: `Approximate consumer prices are shown including ${VAT_LABEL} UAE VAT.`,
    icon: <Receipt aria-hidden="true" />,
  },
  {
    title: 'Ready stock',
    body: 'Products marked “In stock” are ready-stock items you can order today.',
    icon: <PackageCheck aria-hidden="true" />,
  },
  {
    title: `Free delivery over ${FREE_DELIVERY_LABEL}`,
    body: `Retail orders over ${FREE_DELIVERY_LABEL} (excl. VAT) are delivered free of charge.`,
    icon: <Truck aria-hidden="true" />,
  },
  {
    title: 'Cash or card on delivery',
    body: 'Pay for online orders when they arrive, in cash or by card.',
    icon: <Banknote aria-hidden="true" />,
  },
  {
    title: 'Formal PDF quotations',
    body: 'Quote requests are answered by our sales team with a formal PDF quotation.',
    icon: <FileText aria-hidden="true" />,
  },
  {
    title: 'Trade accounts',
    body: 'Purchase approvals, team roles and credit terms for businesses.',
    icon: <Building aria-hidden="true" />,
  },
];

const QUOTE_STEPS = [
  {
    title: 'Add products or describe your project',
    body: 'Build a basket from the catalogue, or tell us in your own words what the project needs.',
    icon: <ClipboardList aria-hidden="true" />,
  },
  {
    title: 'Send the request',
    body: 'Add your contact details, delivery emirate and timing. No account is needed.',
    icon: <Send aria-hidden="true" />,
  },
  {
    title: 'Receive a formal quotation',
    body: 'Our sales team replies with a formal PDF quotation for your quantities.',
    icon: <FileText aria-hidden="true" />,
  },
  {
    title: 'Order and delivery',
    body: 'Confirm the quotation and we arrange delivery to your site.',
    icon: <Truck aria-hidden="true" />,
  },
];

const TRADE_FEATURES = [
  {
    title: 'Project pricing',
    body: 'Negotiated trade prices across the catalogue and formal quotations for project quantities.',
    icon: <BadgePercent aria-hidden="true" />,
  },
  {
    title: 'Purchase approvals',
    body: 'Set purchasing limits so larger orders go to an approver before they are placed.',
    icon: <ShieldCheck aria-hidden="true" />,
  },
  {
    title: 'Credit terms',
    body: 'Buy on agreed payment terms once Top Flow has verified your trade account.',
    icon: <CreditCard aria-hidden="true" />,
  },
  {
    title: 'Team roles',
    body: 'Invite colleagues as owners, approvers or buyers, with delivery sites for each project.',
    icon: <Users aria-hidden="true" />,
  },
];

type HomeData = [CategoryDto[], Paginated<ProductDto> | null, Paginated<ProductDto> | null];

export default async function HomePage() {
  await connection();
  const [categories, ready, everything]: HomeData = await Promise.all([
    serverApi<CategoryDto[]>('/catalog/categories', { revalidate: 300 }).catch((): CategoryDto[] => []),
    serverApi<Paginated<ProductDto>>('/catalog/products', {
      searchParams: new URLSearchParams({ pageSize: '8', sort: 'name', stockStatus: 'IN_STOCK' }),
      revalidate: 0,
    }).catch(() => null),
    serverApi<Paginated<ProductDto>>('/catalog/products', { searchParams: new URLSearchParams({ pageSize: '1' }), revalidate: 0 }).catch(() => null),
  ]);

  const topLevel = categories.filter((category) => category.parentId === null && (category.productCount ?? 0) > 0);
  const collage = topLevel.filter((category) => category.imageUrl).slice(0, 4);
  const stats = [
    { value: everything?.total ?? 0, label: 'Products listed' },
    { value: ready?.total ?? 0, label: 'Ready-stock items' },
    { value: topLevel.length, label: 'Categories' },
  ].filter((stat) => stat.value > 0);

  return (
    <>
      <section aria-labelledby="hero-heading" className="relative isolate overflow-hidden border-b border-slate-200 bg-white">
        <FlowLines className="pointer-events-none absolute inset-0 -z-10 size-full text-flow-600" />
        <Container className="grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:py-24">
          <div>
            <p className="eyebrow text-brand-700">{COMPANY.productName} · Irrigation &amp; flow-control supply</p>
            <h1 id="hero-heading" className="heading-display mt-5 max-w-3xl">
              Irrigation and flow-control supplies for projects across the UAE
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
              Fittings, sprinklers, drip lines, valves, controllers, filtration, pumps and fertigation for contractors, farms, landscapers, facilities teams
              and homeowners. See approximate prices including VAT, then request a formal quotation for your quantities.
            </p>

            <Form action="/products" role="search" className="mt-8 flex max-w-xl flex-col gap-2 sm:flex-row">
              <label htmlFor="hero-search" className="sr-only">
                Search the catalogue
              </label>
              <SearchInput id="hero-search" name="search" size="lg" placeholder="Search products, SKUs or sizes…" enterKeyHint="search" className="flex-1" />
              <Button type="submit" size="lg" variant="dark">
                Search
              </Button>
            </Form>

            <div className="mt-6 flex flex-wrap gap-3">
              <LinkButton href="/quote" size="lg" className="w-full sm:w-auto">
                <FileText aria-hidden="true" />
                Request a quote
              </LinkButton>
              <LinkButton href="/products" size="lg" variant="secondary" className="w-full sm:w-auto">
                Browse the catalogue
                <ArrowRight aria-hidden="true" />
              </LinkButton>
            </div>

            {stats.length > 0 && (
              <dl className="mt-10 grid max-w-xl grid-cols-3 gap-4 border-t border-slate-200 pt-6">
                {stats.map((stat) => (
                  <div key={stat.label} className="flex flex-col-reverse gap-1">
                    <dt className="text-sm text-slate-600">{stat.label}</dt>
                    <dd className="text-2xl font-semibold tracking-tight tabular-nums text-ink-900 sm:text-3xl">{stat.value.toLocaleString('en-AE')}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          {collage.length === 4 && (
            <div className="hidden grid-cols-2 gap-4 lg:grid" aria-hidden="true">
              {collage.map((category) => (
                <div key={category.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
                  <div className="aspect-[4/3]">
                    <ProductImage product={{ imageUrl: category.imageUrl, name: category.name }} alt="" className="size-full object-contain p-6" />
                  </div>
                  <p className="flex items-center gap-2 border-t border-slate-100 px-4 py-3 text-sm font-medium text-ink-900">
                    <CategoryIcon slug={category.slug} className="size-4 shrink-0 text-flow-700" />
                    <span className="truncate">{category.name}</span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </Container>
      </section>

      <Section id="about" aria-labelledby="about-heading">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
          <div>
            <SectionHeading
              id="about-heading"
              eyebrow={`About ${COMPANY.productName}`}
              title="Everything for the irrigation system, in one catalogue"
              description={`${COMPANY.name} supplies irrigation and flow-control products across the UAE. ${COMPANY.productName} brings the catalogue, approximate prices, quotations and trade accounts together in one place.`}
            />
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="/contact" variant="secondary">
                Contact our team
              </LinkButton>
            </div>
          </div>
          <ul className="grid gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-2">
            {TRUST_POINTS.map((point) => (
              <li key={point.title} className="flex gap-4 bg-white p-5">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700 [&_svg]:size-5">{point.icon}</span>
                <div>
                  <h3 className="heading-4">{point.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{point.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {topLevel.length > 0 && (
        <Section tone="white" aria-labelledby="categories-heading">
          <SectionHeading
            id="categories-heading"
            eyebrow="Catalogue"
            title="Shop by category"
            description={`${pluralize(topLevel.length, 'category', 'categories')} of irrigation and flow-control products.`}
            action={{ href: '/products', label: everything?.total ? `View all ${everything.total.toLocaleString('en-AE')} products` : 'View the catalogue' }}
          />
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {topLevel.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/products?category=${category.slug}`}
                  className="group flex h-full gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-brand-300 hover:shadow-raised"
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="grid size-10 place-items-center rounded-lg bg-flow-50 text-flow-700 ring-1 ring-flow-100 ring-inset">
                      <CategoryIcon slug={category.slug} className="size-5" />
                    </span>
                    <h3 className="heading-4 mt-4 group-hover:text-brand-700">{category.name}</h3>
                    {category.description && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{category.description}</p>}
                    <p className="mt-auto inline-flex items-center gap-1.5 pt-4 text-sm font-medium text-brand-700">
                      {pluralize(category.productCount ?? 0, 'product')}
                      <ArrowRight aria-hidden="true" className="size-4 transition-transform motion-safe:group-hover:translate-x-0.5" />
                    </p>
                  </div>
                  {category.imageUrl && (
                    <div className="hidden size-24 shrink-0 self-center overflow-hidden rounded-lg bg-slate-50 sm:block">
                      <ProductImage
                        product={{ imageUrl: category.imageUrl, name: category.name }}
                        alt=""
                        className="size-full object-contain p-2 transition-transform duration-300 motion-safe:group-hover:scale-105"
                      />
                    </div>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section aria-labelledby="quoting-heading">
        <SectionHeading
          id="quoting-heading"
          eyebrow="How quoting works"
          title="From enquiry to delivery in four steps"
          description="Send a basket of catalogue items or simply describe the project. No account is needed."
          action={{ href: '/quote', label: 'Request a quote' }}
        />
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {QUOTE_STEPS.map((step, index) => (
            <li key={step.title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <span className="grid size-10 place-items-center rounded-lg bg-brand-600 text-white [&_svg]:size-5">{step.icon}</span>
                <span className="eyebrow text-slate-600">Step {index + 1}</span>
              </div>
              <h3 className="heading-4 mt-5">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{step.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      {ready && ready.items.length > 0 && (
        <Section tone="white" aria-labelledby="ready-heading">
          <SectionHeading
            id="ready-heading"
            eyebrow="Ready stock"
            title="In stock now"
            description="Add items to a quote for your quantities, or buy online at the listed price."
            action={{ href: '/products?stockStatus=IN_STOCK', label: `All ${ready.total.toLocaleString('en-AE')} ready-stock items` }}
          />
          <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {ready.items.map((product) => (
              <li key={product.id}>
                <ProductCard product={product} trade={false} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section
        tone="dark"
        aria-labelledby="trade-heading"
        decoration={<FlowLines className="pointer-events-none absolute inset-0 -z-10 size-full text-flow-300" />}
      >
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-16">
          <div>
            <SectionHeading
              tone="dark"
              id="trade-heading"
              eyebrow="For trade customers"
              title="A trade account built for project buying"
              description="Contractors, landscapers and facilities teams buy with their own prices, approvals and payment terms."
            />
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="/register?type=business" size="lg" variant="light">
                <Building aria-hidden="true" />
                Open a trade account
              </LinkButton>
              <LinkButton href="/login" size="lg" variant="outline-light">
                Sign in
              </LinkButton>
            </div>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {TRADE_FEATURES.map((feature) => (
              <li key={feature.title} className="rounded-xl border border-white/10 bg-white/5 p-5">
                <span className="grid size-10 place-items-center rounded-lg bg-white/10 text-brand-200 [&_svg]:size-5">{feature.icon}</span>
                <h3 className="heading-4 mt-4 text-white">{feature.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{feature.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section aria-labelledby="contact-heading">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
          <div>
            <SectionHeading
              id="contact-heading"
              eyebrow="Contact"
              title="Talk to our sales team"
              description="Call, message us on WhatsApp or send an email about products, quotations, deliveries and trade accounts."
            />
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="/quote">
                <FileText aria-hidden="true" />
                Request a quote
              </LinkButton>
              <LinkButton href="/contact" variant="secondary">
                Contact details
              </LinkButton>
            </div>
          </div>
          <div className="space-y-4">
            <ContactOptions variant="full" />
            <CompanyLocation />
          </div>
        </div>
      </Section>
    </>
  );
}
