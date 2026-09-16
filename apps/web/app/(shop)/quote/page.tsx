'use client';

import {
  CONTACT_CHANNEL_LABELS,
  ContactChannel,
  EMIRATE_LABELS,
  PROJECT_ENQUIRY_MIN_LENGTH,
  UOM_LABELS,
  createWebsiteQuoteRequestSchema,
  type Emirate,
  type WebsiteQuoteReceiptDto,
} from '@topflow/shared';
import { Check, CircleCheck, ClipboardList, FileText, Mail, MessageCircle, MessageSquareText, Phone, PhoneCall, Send, Trash, Truck } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ProductImage } from '@/components/catalog/product-card';
import { ContactOptions, ServiceArea } from '@/components/contact-options';
import {
  Alert,
  ArrowLink,
  Button,
  Card,
  Container,
  Field,
  IconButton,
  Input,
  LinkButton,
  PageHeader,
  QuantityInput,
  Select,
  Skeleton,
  Textarea,
  cx,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { clearCart, removeFromCart, setQuantity, useCart, useCartHydrated } from '@/lib/cart';
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from '@/lib/forms';
import { pluralize, todayInDubai } from '@/lib/format';
import { useSession } from '@/lib/session';

const NOTES_MAX = 2000;
const LINE_NOTE_MAX = 300;
const REFERENCE_MAX = 120;

interface Draft {
  name: string;
  email: string;
  phone: string;
  companyName: string;
  emirate: Emirate | '';
  preferredContact: ContactChannel | '';
  projectReference: string;
  requiredBy: string;
  notes: string;
}

type TextKey = 'name' | 'companyName' | 'email' | 'phone' | 'projectReference';

const CHANNEL_ICONS: Record<ContactChannel, ReactNode> = {
  PHONE: <Phone aria-hidden="true" />,
  WHATSAPP: <MessageCircle aria-hidden="true" />,
  EMAIL: <Mail aria-hidden="true" />,
};

const NEXT_STEPS = [
  { title: 'We review your request', body: 'Our sales team checks the products, quantities and delivery details.', icon: <ClipboardList aria-hidden="true" /> },
  { title: 'We get in touch if needed', body: 'If anything needs clarifying, we contact you the way you prefer.', icon: <PhoneCall aria-hidden="true" /> },
  { title: 'You receive a formal quotation', body: 'Our sales team sends a formal PDF quotation for your quantities.', icon: <FileText aria-hidden="true" /> },
  { title: 'Confirm and we deliver', body: 'Accept the quotation and we arrange delivery to your site.', icon: <Truck aria-hidden="true" /> },
];

function NextSteps({ className }: { className?: string }) {
  return (
    <ol className={cx('space-y-5', className)}>
      {NEXT_STEPS.map((step, index) => (
        <li key={step.title} className="relative flex gap-3.5">
          {index < NEXT_STEPS.length - 1 && <span aria-hidden="true" className="absolute top-10 -bottom-5 left-5 -ml-px w-px bg-slate-200" />}
          <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700 [&_svg]:size-4.5">{step.icon}</span>
          <div className="min-w-0 pt-1">
            <p className="text-sm font-semibold text-ink-900">{step.title}</p>
            <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function FormSection({ step, title, description, children }: { step: number; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <fieldset className="min-w-0">
        <legend className="flex items-center gap-3">
          <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-ink-900 text-xs font-semibold text-white">
            {step}
          </span>
          <span className="heading-3">{title}</span>
        </legend>
        {description && <div className="mt-2 text-sm leading-relaxed text-slate-600">{description}</div>}
        <div className="mt-5 space-y-5">{children}</div>
      </fieldset>
    </Card>
  );
}

export default function QuotePage() {
  const { lines } = useCart();
  const hydrated = useCartHydrated();
  const { user, activeMembership } = useSession();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [lineNotes, setLineNotes] = useState<Record<string, string>>({});
  const [openNotes, setOpenNotes] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [sent, setSent] = useState<{ receipt: WebsiteQuoteReceiptDto; email: string; enquiry: boolean } | null>(null);
  const [today] = useState(todayInDubai);
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const focusAfterRemoval = useRef(false);

  // After a line is removed, keep focus in the form: on the remaining list, or on the project
  // description once the basket is empty (runs after React has swapped the section).
  useEffect(() => {
    if (!focusAfterRemoval.current) return;
    focusAfterRemoval.current = false;
    (document.getElementById('quote-products') ?? document.getElementById('quote-notes'))?.focus();
  }, [lines.length]);

  // Until the visitor edits the form, the signed-in account (if any) supplies the contact details.
  const values: Draft = draft ?? {
    name: user?.fullName ?? '',
    email: user?.email ?? '',
    phone: user?.phoneNumber ?? '',
    companyName: activeMembership?.organizationName ?? '',
    emirate: '',
    preferredContact: '',
    projectReference: '',
    requiredBy: '',
    notes: '',
  };
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft({ ...values, [key]: value });
  const enquiry = hydrated && lines.length === 0;
  const lineError = (index: number, field: 'quantity' | 'notes') => errors[`items.${index}.${field}`];

  // Focus moves once React has rendered the change: the first invalid field, a new note field, the error.
  const [focusRequest, setFocusRequest] = useState(0);
  const noteToFocus = useRef<string | null>(null);
  useEffect(() => {
    if (focusRequest === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusRequest]);
  useEffect(() => {
    if (!noteToFocus.current) return;
    document.getElementById(noteToFocus.current)?.focus();
    noteToFocus.current = null;
  }, [openNotes]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const focusFirstInvalid = () => setFocusRequest((count) => count + 1);

  const openNote = (productId: string) => {
    noteToFocus.current = `line-note-${productId}`;
    setOpenNotes({ ...openNotes, [productId]: true });
  };

  const removeLine = (productId: string, name: string) => {
    removeFromCart(productId);
    setLineNotes((notes) => Object.fromEntries(Object.entries(notes).filter(([id]) => id !== productId)));
    setErrors({});
    setAnnouncement(`Removed ${name} from your quote.`);
    focusAfterRemoval.current = true;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const clientErrors: FieldErrors = {};
    if (values.requiredBy && values.requiredBy < today) clientErrors.requiredBy = 'Choose today or a later date';
    if (lines.length === 0 && values.notes.trim().length < PROJECT_ENQUIRY_MIN_LENGTH) {
      clientErrors.notes = `Describe what you need in at least ${PROJECT_ENQUIRY_MIN_LENGTH} characters`;
    }

    const parsed = createWebsiteQuoteRequestSchema.safeParse({
      name: values.name,
      email: values.email,
      phone: values.phone,
      companyName: values.companyName,
      emirate: values.emirate || undefined,
      preferredContact: values.preferredContact || undefined,
      projectReference: values.projectReference,
      requiredBy: values.requiredBy || undefined,
      notes: values.notes,
      items: lines.map((line) => ({ productId: line.productId, quantity: line.quantity, notes: lineNotes[line.productId] ?? '' })),
    });

    if (!parsed.success || Object.keys(clientErrors).length > 0) {
      setErrors({ ...(parsed.success ? {} : zodFieldErrors(parsed.error)), ...clientErrors });
      focusFirstInvalid();
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      const receipt = await api<WebsiteQuoteReceiptDto>('/quote-requests', { method: 'POST', body: parsed.data });
      setSent({ receipt, email: parsed.data.email, enquiry: parsed.data.items.length === 0 });
      clearCart();
      setLineNotes({});
      setOpenNotes({});
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(errorMessage(err));
      setErrors(apiFieldErrors(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <Container className="py-10 sm:py-16">
        <div className="mx-auto max-w-3xl">
          <Card className="p-6 text-center sm:p-10">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-success-50 text-success-600">
              <CircleCheck aria-hidden="true" className="size-7" />
            </span>
            <p className="eyebrow mt-6 text-brand-700">Quote request sent</p>
            <h1 ref={(node) => node?.focus()} tabIndex={-1} className="heading-1 mt-3 focus:outline-none">
              Thank you — we’ve received your request
            </h1>
            <p className="mt-6 text-sm text-slate-600">Your reference number</p>
            <p className="mt-1 font-mono text-2xl font-semibold tracking-wide text-ink-900">{sent.receipt.number}</p>
            <p className="mx-auto mt-5 max-w-lg text-sm leading-relaxed text-slate-600">
              We emailed a confirmation to <strong className="font-medium text-ink-900">{sent.email}</strong>. Our sales team will review{' '}
              {sent.enquiry ? 'your project details' : `your ${pluralize(sent.receipt.lineCount, 'item')}`} and reply with a formal quotation. Please
              mention your reference number if you contact us.
            </p>
            <p className="mt-3 text-xs text-slate-600">Your basket has been cleared.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <LinkButton href="/products" size="lg">
                Continue browsing
              </LinkButton>
              <LinkButton href="/" size="lg" variant="secondary">
                Back to home
              </LinkButton>
            </div>
          </Card>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <Card className="p-5 sm:p-6">
              <h2 className="heading-3">What happens next</h2>
              <NextSteps className="mt-5" />
            </Card>
            <Card className="p-5 sm:p-6">
              <h2 className="heading-3">Need to add something?</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">Contact our sales team and mention your reference number.</p>
              <ContactOptions layout="column" className="mt-4" />
            </Card>
          </div>
        </div>
      </Container>
    );
  }

  const textField = (
    key: TextKey,
    label: string,
    options: { type?: string; autoComplete?: string; placeholder?: string; optional?: boolean; hint?: string; maxLength?: number; className?: string } = {},
  ) => (
    <Field label={label} htmlFor={`quote-${key}`} error={errors[key]} hint={options.hint} optional={options.optional} className={options.className}>
      <Input
        id={`quote-${key}`}
        name={key}
        type={options.type ?? 'text'}
        autoComplete={options.autoComplete}
        placeholder={options.placeholder}
        maxLength={options.maxLength}
        value={values[key]}
        onChange={(event) => update(key, event.target.value)}
        aria-invalid={Boolean(errors[key])}
        aria-required={options.optional ? undefined : true}
      />
    </Field>
  );

  return (
    <Container className="py-8 sm:py-10">
      <PageHeader
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Request a quote' }]}
        title="Request a quote"
        description={
          <p className="max-w-2xl">
            {enquiry
              ? 'Your basket is empty — no problem. Describe what you need and our sales team will reply with a formal quotation.'
              : 'Send your basket to Top Flow’s sales team. We’ll reply with a formal quotation for your quantities, with delivery to your site.'}
          </p>
        }
      />

      {activeMembership && (
        <Alert tone="info" className="mb-6">
          Buying for {activeMembership.organizationName}?{' '}
          <Link href="/cart" className="font-semibold underline underline-offset-4">
            Submit a trade RFQ from your basket
          </Link>{' '}
          to get negotiated prices and approvals.
        </Alert>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start xl:grid-cols-[minmax(0,1fr)_400px]">
        <form ref={formRef} onSubmit={submit} noValidate className="min-w-0 space-y-6">
          <p className="text-sm text-slate-600">All fields are required unless marked optional.</p>

          {!hydrated ? (
            <Card className="space-y-4 p-5 sm:p-6">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </Card>
          ) : enquiry ? (
            <FormSection
              step={1}
              title="Your project"
              description={
                <>
                  Describe the products, sizes, quantities and site, and our sales team will propose the items. Prefer to pick them yourself?{' '}
                  <Link href="/products" className="font-semibold text-brand-700 underline-offset-4 hover:underline">
                    Browse the catalogue
                  </Link>
                  .
                </>
              }
            >
              <Field
                label="What do you need?"
                htmlFor="quote-notes"
                error={errors.notes}
                hint={`At least ${PROJECT_ENQUIRY_MIN_LENGTH} characters · ${values.notes.length.toLocaleString('en-AE')} / ${NOTES_MAX.toLocaleString('en-AE')}`}
              >
                <Textarea
                  id="quote-notes"
                  rows={7}
                  maxLength={NOTES_MAX}
                  value={values.notes}
                  onChange={(event) => update('notes', event.target.value)}
                  aria-invalid={Boolean(errors.notes)}
                  aria-required
                  placeholder="For example: HDPE pipe and electrofusion couplers, pop-up sprays and a controller for a villa garden in Dubai."
                />
              </Field>
            </FormSection>
          ) : (
            <FormSection step={1} title={`Products (${lines.length})`} description="Adjust quantities, remove items or add a note for our sales team.">
              <ul id="quote-products" tabIndex={-1} aria-label="Products in your quote" className="divide-y divide-slate-200 focus:outline-none">
                {lines.map((line, index) => {
                  const noteId = `line-note-${line.productId}`;
                  const quantityId = `quote-quantity-${line.productId}`;
                  const note = lineNotes[line.productId] ?? '';
                  const noteOpen = openNotes[line.productId] || note !== '' || Boolean(lineError(index, 'notes'));
                  return (
                    <li key={line.productId} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex gap-3 sm:gap-4">
                        <Link
                          href={`/products/${line.slug}`}
                          tabIndex={-1}
                          aria-hidden="true"
                          className="size-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white"
                        >
                          <ProductImage product={{ imageUrl: line.imageUrl ?? null, name: line.name }} alt="" className="size-full object-contain p-1.5" />
                        </Link>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <Link href={`/products/${line.slug}`} className="line-clamp-2 font-medium text-ink-900 hover:text-brand-700">
                                {line.name}
                              </Link>
                              <p className="font-mono text-xs text-slate-600">{line.sku}</p>
                            </div>
                            <IconButton label={`Remove ${line.name}`} size="sm" onClick={() => removeLine(line.productId, line.name)}>
                              <Trash aria-hidden="true" />
                            </IconButton>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                            <div className="flex items-center gap-2">
                              <QuantityInput
                                id={quantityId}
                                label={`Quantity of ${line.name}`}
                                size="sm"
                                value={line.quantity}
                                min={line.minOrderQty}
                                onChange={(quantity) => setQuantity(line.productId, quantity)}
                                invalid={Boolean(lineError(index, 'quantity'))}
                                aria-describedby={lineError(index, 'quantity') ? `${quantityId}-error` : undefined}
                              />
                              <span className="text-sm text-slate-600">{UOM_LABELS[line.uom]}</span>
                            </div>
                            {!noteOpen && (
                              <button
                                type="button"
                                onClick={() => openNote(line.productId)}
                                className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm text-sm font-medium text-flow-700 underline-offset-4 hover:underline"
                              >
                                <MessageSquareText aria-hidden="true" className="size-4" />
                                Add a note
                              </button>
                            )}
                          </div>
                          {lineError(index, 'quantity') && (
                            <p id={`${quantityId}-error`} role="alert" className="mt-1.5 text-xs font-medium text-danger-700">
                              {lineError(index, 'quantity')}
                            </p>
                          )}
                          {noteOpen && (
                            <Field
                              className="mt-3"
                              label="Note for this item"
                              htmlFor={noteId}
                              optional
                              error={lineError(index, 'notes')}
                              hint={`${note.length} / ${LINE_NOTE_MAX} characters`}
                            >
                              <Textarea
                                id={noteId}
                                rows={2}
                                maxLength={LINE_NOTE_MAX}
                                value={note}
                                onChange={(event) => setLineNotes({ ...lineNotes, [line.productId]: event.target.value })}
                                aria-invalid={Boolean(lineError(index, 'notes'))}
                                placeholder="Alternatives you would accept, colour, delivery split…"
                              />
                            </Field>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <ArrowLink href="/products">Add more products</ArrowLink>
            </FormSection>
          )}

          <FormSection step={2} title="Your details">
            <div className="grid gap-5 sm:grid-cols-2">
              {textField('name', 'Full name', { autoComplete: 'name' })}
              {textField('companyName', 'Company', { autoComplete: 'organization', optional: true })}
              {textField('email', 'Email', { type: 'email', autoComplete: 'email' })}
              {textField('phone', 'Mobile number', { type: 'tel', autoComplete: 'tel', placeholder: '+971 50 123 4567' })}
            </div>
          </FormSection>

          <FormSection step={3} title="Delivery and timing">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Delivery emirate" htmlFor="quote-emirate" optional error={errors.emirate}>
                <Select
                  id="quote-emirate"
                  value={values.emirate}
                  onChange={(event) => update('emirate', event.target.value as Emirate | '')}
                  aria-invalid={Boolean(errors.emirate)}
                >
                  <option value="">Not sure yet</option>
                  {Object.entries(EMIRATE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Required by" htmlFor="quote-requiredBy" optional error={errors.requiredBy} hint="Leave blank if your dates are flexible">
                <Input
                  id="quote-requiredBy"
                  type="date"
                  min={today}
                  value={values.requiredBy}
                  onChange={(event) => update('requiredBy', event.target.value)}
                  aria-invalid={Boolean(errors.requiredBy)}
                />
              </Field>
              {textField('projectReference', 'Project reference', {
                optional: true,
                maxLength: REFERENCE_MAX,
                placeholder: 'e.g. Villa garden, Al Barsha',
                hint: 'Shown on your quotation',
                className: 'sm:col-span-2',
              })}
            </div>

            <fieldset aria-describedby="quote-contact-hint">
              <legend className="flex w-full items-baseline justify-between gap-3 text-sm font-medium text-ink-900">
                <span>Preferred contact</span>
                <span className="text-xs font-normal text-slate-500">Optional</span>
              </legend>
              <p id="quote-contact-hint" className="mt-1 text-xs text-slate-600">
                How should our sales team get back to you?
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {Object.values(ContactChannel).map((channel) => {
                  const checked = values.preferredContact === channel;
                  return (
                    <label
                      key={channel}
                      className={cx(
                        'flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-3 text-sm font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-flow-600',
                        checked ? 'border-brand-600 bg-brand-50 text-brand-800 ring-1 ring-brand-600 ring-inset' : 'border-slate-300 bg-white text-ink-900 hover:border-slate-400',
                      )}
                    >
                      <input
                        type="radio"
                        name="preferredContact"
                        value={channel}
                        checked={checked}
                        onChange={() => update('preferredContact', channel)}
                        className="sr-only"
                      />
                      <span className={cx('grid size-8 shrink-0 place-items-center rounded-full [&_svg]:size-4', checked ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600')}>
                        {CHANNEL_ICONS[channel]}
                      </span>
                      {CONTACT_CHANNEL_LABELS[channel]}
                      {checked && <Check aria-hidden="true" className="ml-auto size-4 text-brand-700" />}
                    </label>
                  );
                })}
              </div>
              {values.preferredContact && (
                <button
                  type="button"
                  onClick={() => update('preferredContact', '')}
                  className="mt-2 cursor-pointer rounded-sm text-xs font-medium text-slate-600 underline underline-offset-4 hover:text-ink-900"
                >
                  Clear preference
                </button>
              )}
              {errors.preferredContact && (
                <p role="alert" className="mt-1.5 text-xs font-medium text-danger-700">
                  {errors.preferredContact}
                </p>
              )}
            </fieldset>

            {hydrated && !enquiry && (
              <Field
                label="Project details"
                htmlFor="quote-notes"
                optional
                error={errors.notes}
                hint={`Site, timing, alternatives you would accept… · ${values.notes.length.toLocaleString('en-AE')} / ${NOTES_MAX.toLocaleString('en-AE')}`}
              >
                <Textarea
                  id="quote-notes"
                  rows={4}
                  maxLength={NOTES_MAX}
                  value={values.notes}
                  onChange={(event) => update('notes', event.target.value)}
                  aria-invalid={Boolean(errors.notes)}
                />
              </Field>
            )}
          </FormSection>

          {errors.items && <Alert tone="danger">{errors.items}</Alert>}
          {error && (
            <div ref={errorRef} tabIndex={-1} className="focus:outline-none">
              <Alert tone="danger" title="We couldn’t send your request">
                {error}
              </Alert>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button type="submit" size="lg" loading={submitting} disabled={!hydrated}>
              {!submitting && <Send aria-hidden="true" />}
              Send quote request
            </Button>
            <p className="text-xs leading-relaxed text-slate-600">No account needed. We only use your details to reply to this request.</p>
          </div>
        </form>

        <aside className="space-y-6" aria-label="About your quote request">
          <Card className="p-5 sm:p-6">
            <h2 className="heading-3">What happens next</h2>
            <NextSteps className="mt-5" />
          </Card>
          <Card tone="muted" className="p-5 sm:p-6">
            <h2 className="heading-4">Prefer to talk?</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">Our sales team can also take your request by phone, WhatsApp or email.</p>
            <ContactOptions layout="column" className="mt-4" />
            <ServiceArea className="mt-4 text-sm" />
          </Card>
        </aside>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </Container>
  );
}
