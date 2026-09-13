import type { CategoryDto, Paginated, ProductDto } from '@topflow/shared';
import Link from 'next/link';
import { connection } from 'next/server';
import { ProductCard } from '@/components/catalog/product-card';
import { LinkButton } from '@/components/ui';
import { serverApi } from '@/lib/server-api';

const VALUE_PROPS = [
  { title: 'Prices include VAT', body: 'Transparent retail pricing with 5% UAE VAT already applied.' },
  { title: 'Free delivery over AED 500', body: 'Delivered across all seven emirates. Pay by cash or card on delivery.' },
  { title: 'Trade quotations', body: 'Request a formal quotation for your project and receive a PDF offer.' },
  { title: 'Credit for businesses', body: 'Verified trade accounts get negotiated prices and payment terms.' },
];

const PROCUREMENT_STEPS = [
  { step: '1', title: 'Build your list', body: 'Add products to your cart from the trade catalog, including trade-only items.' },
  { step: '2', title: 'Request a quotation', body: 'Submit an RFQ with your project reference and delivery site.' },
  { step: '3', title: 'Review & approve', body: 'Accept, negotiate a revision, or route it to your approver above your limit.' },
  { step: '4', title: 'Track delivery', body: 'Your order is released on your terms and tracked to site.' },
];

export default async function HomePage() {
  await connection();
  const [categories, featured] = await Promise.all([
    serverApi<CategoryDto[]>('/catalog/categories', { revalidate: 300 }).catch(() => [] as CategoryDto[]),
    serverApi<Paginated<ProductDto>>('/catalog/products', {
      searchParams: new URLSearchParams({ pageSize: '8', sort: 'newest', stockStatus: 'IN_STOCK' }),
      revalidate: 60,
    }).catch(() => null),
  ]);

  return (
    <div className="-mt-8 space-y-16">
      <section className="relative -mx-4 overflow-hidden bg-gradient-to-br from-ink-900 via-ink-800 to-brand-800 px-6 py-16 text-white sm:-mx-6 sm:px-12 sm:py-20 lg:rounded-b-3xl">
        <div className="max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-widest text-brand-200">Irrigation &amp; flow control · UAE</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Everything that keeps water flowing — from villa gardens to city parks.</h1>
          <p className="mt-5 text-lg text-slate-300">
            Shop sprinklers, drip irrigation, valves, controllers and pumps online, or open a trade account for project quotations and credit terms.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton href="/products" size="lg">
              Shop products
            </LinkButton>
            <LinkButton href="/register?type=business" size="lg" variant="secondary" className="border-white/20 bg-white/10 text-white hover:bg-white/20">
              Open a trade account
            </LinkButton>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {VALUE_PROPS.map((item) => (
          <div key={item.title} className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="font-semibold text-ink-900">{item.title}</p>
            <p className="mt-1 text-sm text-slate-600">{item.body}</p>
          </div>
        ))}
      </section>

      {categories.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold tracking-tight text-ink-900">Shop by category</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {categories
              .filter((category) => (category.productCount ?? 0) > 0)
              .map((category) => (
                <Link
                  key={category.id}
                  href={`/products?category=${category.slug}`}
                  className="group rounded-xl border border-slate-200 bg-white p-5 transition hover:border-brand-500 hover:shadow-md"
                >
                  <p className="font-semibold text-ink-900 group-hover:text-brand-700">{category.name}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-500">{category.description}</p>
                  <p className="mt-3 text-xs font-medium text-brand-700">{category.productCount} products →</p>
                </Link>
              ))}
          </div>
        </section>
      )}

      {featured && featured.items.length > 0 && (
        <section>
          <div className="flex items-end justify-between">
            <h2 className="text-2xl font-bold tracking-tight text-ink-900">In stock now</h2>
            <Link href="/products" className="text-sm font-medium text-brand-700 hover:underline">
              View all products
            </Link>
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {featured.items.map((product) => (
              <ProductCard key={product.id} product={product} trade={false} />
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-brand-200 bg-brand-50/60 p-8">
        <p className="text-sm font-medium uppercase tracking-wide text-brand-700">For contractors &amp; landscapers</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-ink-900">Procurement built for projects</h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PROCUREMENT_STEPS.map((item) => (
            <div key={item.step}>
              <span className="grid size-8 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white">{item.step}</span>
              <p className="mt-3 font-semibold text-ink-900">{item.title}</p>
              <p className="mt-1 text-sm text-slate-600">{item.body}</p>
            </div>
          ))}
        </div>
        <LinkButton href="/register?type=business" className="mt-8">
          Apply for a trade account
        </LinkButton>
      </section>
    </div>
  );
}
