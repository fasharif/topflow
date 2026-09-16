import { Building, FileText } from 'lucide-react';
import type { Metadata } from 'next';
import { CompanyLocation, ContactOptions } from '@/components/contact-options';
import { Card, Container, LinkButton, PageHeader } from '@/components/ui';
import { organizationJsonLd } from '@/lib/company';

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'Contact Top Flow’s sales team by phone, WhatsApp or email about irrigation and flow-control supplies, quotations and trade accounts. Serving all seven Emirates of the United Arab Emirates.',
};

export default function ContactPage() {
  return (
    <Container className="py-8 sm:py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()).replace(/</g, '\\u003c') }} />

      <PageHeader
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Contact' },
        ]}
        eyebrow="Contact"
        title="Talk to our sales team"
        description={<p className="max-w-2xl">Call, message us on WhatsApp or email Top Flow about products, quotations, deliveries and trade accounts.</p>}
      />

      <section aria-labelledby="contact-channels-heading">
        <h2 id="contact-channels-heading" className="sr-only">
          Ways to contact us
        </h2>
        <ContactOptions variant="full" />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="location-heading" className="flex flex-col">
          <h2 id="location-heading" className="sr-only">
            Location
          </h2>
          <CompanyLocation className="flex-1" />
        </section>

        <Card className="flex flex-col p-5 sm:p-6">
          <h2 className="heading-3">Quotes and trade accounts</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Send your basket or describe your project for a formal PDF quotation. Businesses can open a trade account for project pricing, purchase
            approvals and credit terms.
          </p>
          <div className="mt-auto flex flex-wrap gap-3 pt-6">
            <LinkButton href="/quote">
              <FileText aria-hidden="true" />
              Request a quote
            </LinkButton>
            <LinkButton href="/register?type=business" variant="secondary">
              <Building aria-hidden="true" />
              Open a trade account
            </LinkButton>
          </div>
        </Card>
      </div>
    </Container>
  );
}
