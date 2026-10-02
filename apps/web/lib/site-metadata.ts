import { DEMO_BANNER_TEXT } from '@topflow/shared';
import type { Metadata } from 'next';
import { DEMO_MODE } from '@/lib/demo';

/**
 * Page titles and link previews (Open Graph and Twitter cards). A shared link is often seen only as a
 * preview card, in a chat or on a social network, without the page's banner, so a demo build names
 * itself a portfolio demo in every title and preview (ADR-021).
 */
export const SITE_NAME = DEMO_MODE ? 'TopFlow Hub portfolio demo' : 'Top Flow Hub';

const TITLE = DEMO_MODE
  ? 'TopFlow Hub portfolio demo — not Top Flow’s official store'
  : 'Top Flow Hub — Irrigation & flow-control supplies, UAE';

const DESCRIPTION = DEMO_MODE
  ? `${DEMO_BANNER_TEXT} TopFlow Hub is Farah Sharif’s portfolio project, a B2B and B2C commerce platform built with Top Flow’s permission. Its accounts, orders and quotations are fictional.`
  : 'TopFlow Hub is Top Flow’s supply platform for irrigation and flow-control products in the UAE: electrofusion and HDPE fittings, sprinklers and rotors, drip irrigation, valves and controllers, filtration, pumps, fertigation, greenhouse supplies and hoses. See approximate prices including VAT and request a formal quotation.';

/** The root layout's metadata: default title, title template, description and link previews. */
export function siteMetadata(siteUrl: string): Metadata {
  return {
    metadataBase: new URL(siteUrl),
    title: { default: TITLE, template: `%s · ${SITE_NAME}` },
    description: DESCRIPTION,
    applicationName: SITE_NAME,
    openGraph: { type: 'website', siteName: SITE_NAME, locale: 'en_AE', title: TITLE, description: DESCRIPTION },
    twitter: { card: 'summary', title: TITLE, description: DESCRIPTION },
    // The portfolio demo must never be mistaken for Top Flow's store in search results.
    ...(DEMO_MODE && { robots: { index: false, follow: false } }),
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
