/** Top Flow's public contact details and top-level catalogue structure, shared by the storefront. */
export const COMPANY = {
  name: 'Top Flow',
  tagline: 'Irrigation & flow-control supply, UAE',
  phone: '+971 56 109 1235',
  phoneHref: 'tel:+971561091235',
  whatsappHref: 'https://wa.me/971561091235',
  email: 'info@topflow.ae',
  website: 'www.topflow.ae',
} as const;

export const MAIN_CATEGORIES = [
  { slug: 'electrofusion-hdpe-fittings', name: 'Electrofusion & HDPE Fittings' },
  { slug: 'sprinklers-rotors', name: 'Sprinklers & Rotors' },
  { slug: 'drip-irrigation', name: 'Drip Irrigation' },
  { slug: 'pipes-fittings', name: 'Pipes & Fittings' },
  { slug: 'valves-control', name: 'Valves & Control' },
  { slug: 'filtration', name: 'Filtration' },
  { slug: 'landscaping-hardscape', name: 'Landscaping & Hardscape' },
  { slug: 'specialty', name: 'Specialty' },
  { slug: 'facilities-mep', name: 'Facilities & MEP' },
] as const;
