import { DEMO_BANNER_TEXT } from '@topflow/shared';
import type { Metadata } from 'next';
import { DEMO_MODE } from '@/lib/demo';

/**
 * Page titles and link previews (Open Graph and Twitter cards). A shared link is often seen only as a
 * preview card, in a chat or on a social network, without the notice at the top of the page, so the
 * card must say what the site is. An ordinary build describes itself as Farah Sharif's portfolio
 * project (ADR-023); a demo build names itself a portfolio demo in every title and preview (ADR-021).
 */
export const SITE_NAME = DEMO_MODE ? 'TopFlow Hub portfolio demo' : 'Top Flow Hub';

const APPLICATION_NAME = DEMO_MODE ? SITE_NAME : 'TopFlow Hub';

const TITLE = DEMO_MODE
  ? 'TopFlow Hub portfolio demo — not Top Flow’s official store'
  : 'Top Flow Hub — Irrigation & flow-control supplies, UAE';

const DESCRIPTION = DEMO_MODE
  ? `${DEMO_BANNER_TEXT} TopFlow Hub is Farah Sharif’s portfolio project, a B2B and B2C commerce platform built with Top Flow’s permission. Its accounts, orders and quotations are fictional.`
  : 'A portfolio project by Farah Sharif, built with Top Flow’s permission: a supply platform for irrigation and flow-control products in the UAE, with electrofusion and HDPE fittings, sprinklers and rotors, drip irrigation, valves and controllers, filtration, pumps, fertigation, greenhouse supplies and hoses. Not Top Flow’s official store.';

/**
 * The root layout's metadata: default title, title template, description, link previews and the robots
 * meta tag. Every build, demo or not, asks search engines not to index it (ADR-023); next.config.ts
 * sends the same directive as the X-Robots-Tag header, and app/robots.ts lets crawlers read both.
 */
export function siteMetadata(siteUrl: string): Metadata {
  return {
    metadataBase: new URL(siteUrl),
    title: { default: TITLE, template: `%s · ${SITE_NAME}` },
    description: DESCRIPTION,
    applicationName: APPLICATION_NAME,
    openGraph: { type: 'website', siteName: SITE_NAME, locale: 'en_AE', title: TITLE, description: DESCRIPTION },
    twitter: { card: 'summary', title: TITLE, description: DESCRIPTION },
    robots: { index: false, follow: false },
  };
}

export interface ProductPreview {
  name: string;
  sku: string;
  description: string | null;
  imageUrl: string | null;
}

/** A product page's title and link preview, which show the product rather than the site-wide defaults. */
export function productMetadata(product: ProductPreview): Metadata {
  const summary = product.description ?? `${product.name} — ${product.sku}`;
  const description = DEMO_MODE ? `${DEMO_BANNER_TEXT} ${summary}` : summary;
  // The page title gets the site name from the layout's template; a preview card needs it spelt out.
  const previewTitle = DEMO_MODE ? `${product.name} · ${SITE_NAME}` : product.name;
  const images = product.imageUrl ? [{ url: product.imageUrl, alt: product.name }] : undefined;
  return {
    title: product.name,
    description,
    openGraph: { type: 'website', siteName: SITE_NAME, locale: 'en_AE', title: previewTitle, description, images },
    twitter: { card: 'summary', title: previewTitle, description, images },
  };
}
