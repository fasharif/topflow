/**
 * Top Flow's public contact details, shown on the Account tab and with quote requests.
 * Keep them in step with the web storefront (`apps/web/lib/company.ts`).
 */
export const COMPANY = {
  name: 'Top Flow',
  phone: '+971 56 109 1235',
  phoneHref: 'tel:+971561091235',
  whatsappHref: 'https://wa.me/971561091235',
  email: 'info@topflow.ae',
  emailHref: 'mailto:info@topflow.ae',
  website: 'www.topflow.ae',
  /** Shown instead of a street address, which Top Flow does not publish yet. */
  serviceArea: 'Serving all seven Emirates',
} as const;
