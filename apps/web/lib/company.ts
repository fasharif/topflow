/**
 * Top Flow's public contact details and top-level catalogue structure, shared by the storefront.
 *
 * The street address, map link and opening hours are not published yet. Leave them undefined
 * until the owner confirms them: every view renders them only when present and otherwise shows
 * the service area ("Serving all seven Emirates · United Arab Emirates").
 */
export interface CompanyHours {
  /** e.g. "Monday – Saturday" */
  days: string;
  /** e.g. "8:00 – 18:00" */
  time: string;
}

export interface CompanyProfile {
  name: string;
  /** The online platform's product name. */
  productName: string;
  tagline: string;
  phone: string;
  phoneHref: string;
  whatsappHref: string;
  email: string;
  emailHref: string;
  website: string;
  websiteUrl: string;
  serviceArea: string;
  country: string;
  /** Street address lines, once published. */
  address?: readonly string[];
  /** Google Maps link for the address, once published. */
  mapUrl?: string;
  /** Opening hours, once published. */
  hours?: readonly CompanyHours[];
}

export const COMPANY: CompanyProfile = {
  name: 'Top Flow',
  productName: 'TopFlow Hub',
  tagline: 'Irrigation & flow-control supply, UAE',
  phone: '+971 56 109 1235',
  phoneHref: 'tel:+971561091235',
  whatsappHref: 'https://wa.me/971561091235',
  email: 'info@topflow.ae',
  emailHref: 'mailto:info@topflow.ae',
  website: 'www.topflow.ae',
  websiteUrl: 'https://www.topflow.ae',
  serviceArea: 'Serving all seven Emirates',
  country: 'United Arab Emirates',
};

/** "Serving all seven Emirates · United Arab Emirates", or the first address line once published. */
export function locationLine(): string {
  return `${COMPANY.address?.[0] ?? COMPANY.serviceArea} · ${COMPANY.country}`;
}

/** schema.org Organization built only from published details (no invented address or hours). */
export function organizationJsonLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: COMPANY.name,
    url: COMPANY.websiteUrl,
    telephone: COMPANY.phoneHref.replace(/^tel:/, ''),
    email: COMPANY.email,
    areaServed: 'AE',
    ...(COMPANY.address && { address: COMPANY.address.join(', ') }),
  };
}

export const MAIN_CATEGORIES = [
  { slug: 'electrofusion-hdpe-fittings', name: 'Electrofusion & HDPE Fittings' },
  { slug: 'sprinklers-rotors', name: 'Sprinklers & Rotors' },
  { slug: 'drip-irrigation', name: 'Drip Irrigation' },
  { slug: 'pipes-fittings', name: 'Pipes & Fittings' },
  { slug: 'valves-control', name: 'Valves & Control' },
  { slug: 'filtration', name: 'Filtration' },
  { slug: 'specialty', name: 'Specialty' },
] as const;

export type MainCategorySlug = (typeof MAIN_CATEGORIES)[number]['slug'];
