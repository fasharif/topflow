'use client';

import { EMIRATE_LABELS, UOM_LABELS, createWebsiteQuoteRequestSchema, type Emirate, type WebsiteQuoteReceiptDto } from '@topflow/shared';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { ProductImage } from '@/components/catalog/product-card';
import { Alert, Button, Card, EmptyState, Field, Input, LinkButton, PageHeader, Select, Textarea } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { clearCart, useCart } from '@/lib/cart';
import { COMPANY } from '@/lib/company';
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from '@/lib/forms';
import { useSession } from '@/lib/session';

interface Draft {
  name: string;
  email: string;
  phone: string;
  companyName: string;
  emirate: Emirate | '';
  notes: string;
}

function ContactOptions() {
  return (
    <p className="text-sm text-slate-600">
      Prefer to talk? Call{' '}
      <a href={COMPANY.phoneHref} className="font-medium text-ink-900 hover:underline">
        {COMPANY.phone}
      </a>
      ,{' '}
      <a href={COMPANY.whatsappHref} target="_blank" rel="noopener noreferrer" className="font-medium text-ink-900 hover:underline">
        message us on WhatsApp
      </a>{' '}
      or email{' '}
      <a href={`mailto:${COMPANY.email}`} className="font-medium text-ink-900 hover:underline">
        {COMPANY.email}
      </a>
      .
    </p>
  );
}

export default function QuotePage() {
  const { lines, itemCount } = useCart();
  const { user, activeMembership } = useSession();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState<{ receipt: WebsiteQuoteReceiptDto; email: string } | null>(null);

  // Until the visitor edits the form, the signed-in account (if any) supplies the contact details.
  const values: Draft = draft ?? {
    name: user?.fullName ?? '',
    email: user?.email ?? '',
    phone: user?.phoneNumber ?? '',
    companyName: activeMembership?.organizationName ?? '',
    emirate: '',
    notes: '',
  };
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft({ ...values, [key]: value });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const parsed = createWebsiteQuoteRequestSchema.safeParse({
      ...values,
      emirate: values.emirate || undefined,
      items: lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
    });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const receipt = await api<WebsiteQuoteReceiptDto>('/quote-requests', { method: 'POST', body: parsed.data });
      setSent({ receipt, email: parsed.data.email });
    } catch (err) {
      setError(errorMessage(err));
      setErrors(apiFieldErrors(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <Card className="p-8 text-center sm:p-12">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-brand-50 text-brand-600">
            <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="eyebrow mt-6 text-brand-600">Quote request received</p>
          <h1 className="mt-3 font-display text-4xl tracking-tight text-ink-900">Thank you. We’re on it.</h1>
          <p className="mt-4 text-slate-600">Your reference number is</p>
          <p className="mt-2 font-mono text-2xl tracking-wide text-ink-900">{sent.receipt.number}</p>
          <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-slate-600">
            We emailed a confirmation to <strong className="font-medium text-ink-900">{sent.email}</strong>. Our sales team will review your{' '}
            {sent.receipt.lineCount} item{sent.receipt.lineCount === 1 ? '' : 's'} and reply with a formal quotation by email or phone.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <LinkButton href="/products" size="lg" onClick={() => clearCart()}>
              Clear basket and keep browsing
            </LinkButton>
            <LinkButton href="/cart" size="lg" variant="secondary">
              Keep my basket
            </LinkButton>
          </div>
        </Card>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-xl space-y-6 px-4 py-20 text-center">
        <EmptyState
          title="Add products to request a quote"
          description="Build a basket from the catalogue, then send it to us here for a formal quotation."
          action={<LinkButton href="/products">Browse the catalogue</LinkButton>}
        />
        <ContactOptions />
      </div>
    );
  }

  const field = (key: 'name' | 'email' | 'phone' | 'companyName', label: string, props: { type?: string; autoComplete?: string; placeholder?: string; hint?: string }) => (
    <Field label={label} htmlFor={`quote-${key}`} error={errors[key]} hint={props.hint}>
      <Input
        id={`quote-${key}`}
        type={props.type ?? 'text'}
        autoComplete={props.autoComplete}
        placeholder={props.placeholder}
        value={values[key]}
        onChange={(event) => update(key, event.target.value)}
        aria-invalid={Boolean(errors[key])}
      />
    </Field>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <PageHeader
        eyebrow="Request a quote"
        title="Get your best price"
        description={
          <span className="block max-w-2xl">
            Send your basket to Top Flow’s sales team. We’ll reply with a formal quotation for your quantities, with delivery to your site.
          </span>
        }
      />

      {activeMembership && (
        <div className="mb-6">
          <Alert tone="info">
            Buying for {activeMembership.organizationName}?{' '}
            <Link href="/cart" className="font-medium underline">
              Submit a trade RFQ from your basket
            </Link>{' '}
            to get negotiated prices and approvals.
          </Alert>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
        <Card className="p-6 sm:p-8">
          <form onSubmit={submit} noValidate className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              {field('name', 'Full name', { autoComplete: 'name' })}
              {field('companyName', 'Company (optional)', { autoComplete: 'organization' })}
              {field('email', 'Email', { type: 'email', autoComplete: 'email' })}
              {field('phone', 'Mobile number', { type: 'tel', autoComplete: 'tel', placeholder: '+971 50 123 4567' })}
            </div>
            <Field label="Delivery emirate (optional)" htmlFor="quote-emirate" error={errors.emirate}>
              <Select id="quote-emirate" value={values.emirate} onChange={(event) => update('emirate', event.target.value as Emirate | '')}>
                <option value="">Not sure yet</option>
                {Object.entries(EMIRATE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Project details (optional)" htmlFor="quote-notes" error={errors.notes} hint="Site, timing, alternatives you would accept…">
              <Textarea id="quote-notes" rows={4} value={values.notes} onChange={(event) => update('notes', event.target.value)} />
            </Field>
            {errors.items && <Alert tone="danger">{errors.items}</Alert>}
            {error && <Alert tone="danger">{error}</Alert>}
            <div className="flex flex-wrap items-center gap-4">
              <Button type="submit" size="lg" loading={submitting}>
                Send quote request
              </Button>
              <p className="text-xs text-slate-500">No account needed. We only use your details to reply to this request.</p>
            </div>
          </form>
        </Card>

        <div className="space-y-6">
          <Card className="h-fit overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="font-display text-xl text-ink-900">Your basket</h2>
              <Link href="/cart" className="text-sm font-medium text-brand-600 hover:underline">
                Edit
              </Link>
            </div>
            <ul className="divide-y divide-slate-100">
              {lines.map((line) => (
                <li key={line.productId} className="flex items-center gap-3 px-5 py-3">
                  <div className="size-12 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
                    <ProductImage product={{ imageUrl: line.imageUrl ?? null, name: line.name }} className="size-full object-contain p-1" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">{line.name}</p>
                    <p className="font-mono text-[11px] text-slate-500">{line.sku}</p>
                  </div>
                  <p className="text-sm tabular-nums text-slate-700">
                    {line.quantity} {UOM_LABELS[line.uom]}
                  </p>
                </li>
              ))}
            </ul>
            <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
              {itemCount} item{itemCount === 1 ? '' : 's'} · quantities can be changed on the quotation
            </p>
          </Card>
          <ContactOptions />
        </div>
      </div>
    </div>
  );
}
