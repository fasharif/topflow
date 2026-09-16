import { FileText, House, SearchX } from 'lucide-react';
import type { Metadata } from 'next';
import Form from 'next/form';
import { ContactOptions } from '@/components/contact-options';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { Button, Container, LinkButton, SearchInput } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Page not found',
};

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex-1">
        <Container className="py-16 sm:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-flow-50 text-flow-700">
              <SearchX aria-hidden="true" className="size-6" />
            </span>
            <p className="eyebrow mt-6 text-brand-700">Error 404</p>
            <h1 className="heading-1 mt-3">We couldn’t find that page</h1>
            <p className="mt-3 text-base leading-relaxed text-slate-600">
              The link may be out of date, or the page may have moved. Search the catalogue or go back to the home page.
            </p>

            <Form action="/products" role="search" className="mx-auto mt-8 flex max-w-lg gap-2">
              <label htmlFor="not-found-search" className="sr-only">
                Search the catalogue
              </label>
              <SearchInput id="not-found-search" name="search" placeholder="Search products, SKUs or sizes…" enterKeyHint="search" className="flex-1" />
              <Button type="submit">Search</Button>
            </Form>

            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <LinkButton href="/" variant="secondary">
                <House aria-hidden="true" />
                Home page
              </LinkButton>
              <LinkButton href="/quote" variant="secondary">
                <FileText aria-hidden="true" />
                Request a quote
              </LinkButton>
            </div>

            <div className="mt-12 border-t border-slate-200 pt-6">
              <p className="text-sm text-slate-600">Need help finding a product? Talk to our sales team.</p>
              <ContactOptions className="mt-3 justify-center" />
            </div>
          </div>
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
