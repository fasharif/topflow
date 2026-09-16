'use client';

import { UOM_LABELS, fromFils, type AddressDto, type RfqDto } from '@topflow/shared';
import { FileText, ShoppingBasket, Trash } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { OrderSummary, retailTotals } from '@/components/cart/order-summary';
import { ProductImage } from '@/components/catalog/product-card';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  Container,
  EmptyState,
  Field,
  IconButton,
  Input,
  LinkButton,
  PageHeader,
  QuantityInput,
  Select,
  Skeleton,
  Textarea,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { clearCart, removeFromCart, setQuantity, useCart, useCartHydrated } from '@/lib/cart';
import { aed, pluralize } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useApiQuery } from '@/lib/use-api';

function RfqPanel() {
  const router = useRouter();
  const { lines } = useCart();
  const { activeMembership } = useSession();
  const sites = useApiQuery<AddressDto[]>('/org/addresses', { org: true });
  const [projectReference, setProjectReference] = useState('');
  const [addressId, setAddressId] = useState('');
  const [requiredBy, setRequiredBy] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const rfq = await api<RfqDto>('/org/rfqs', {
        method: 'POST',
        org: true,
        body: {
          items: lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
          projectReference,
          addressId: addressId || undefined,
          requiredBy: requiredBy || undefined,
          notes,
        },
      });
      clearCart();
      router.push(`/business/rfqs/${rfq.id}?submitted=1`);
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Request a trade quotation"
        description={`On behalf of ${activeMembership?.organizationName}. Trade prices are applied on your quotation.`}
      />
      <div className="space-y-4 p-5">
        <Field label="Project reference" htmlFor="projectReference" optional hint="Shown on the quotation and delivery paperwork">
          <Input id="projectReference" value={projectReference} onChange={(e) => setProjectReference(e.target.value)} placeholder="e.g. Dubai Hills — Phase 2" />
        </Field>
        <Field label="Delivery site" htmlFor="site" optional>
          <Select id="site" value={addressId} onChange={(e) => setAddressId(e.target.value)}>
            <option value="">To be confirmed</option>
            {sites.data?.map((site) => (
              <option key={site.id} value={site.id}>
                {site.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Required by" htmlFor="requiredBy" optional>
          <Input id="requiredBy" type="date" value={requiredBy} onChange={(e) => setRequiredBy(e.target.value)} />
        </Field>
        <Field label="Notes for our sales team" htmlFor="notes" optional>
          <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
        <Button className="w-full" size="lg" loading={submitting} onClick={submit}>
          Submit RFQ
        </Button>
      </div>
    </Card>
  );
}

export default function CartPage() {
  const router = useRouter();
  const { lines } = useCart();
  const hydrated = useCartHydrated();
  const session = useSession();
  const tradeOnlyLines = lines.filter((line) => line.isTradeOnly);
  const totals = retailTotals(lines);
  const trade = Boolean(session.activeMembership);

  if (!hydrated) {
    return (
      <Container className="py-8 sm:py-10">
        <p role="status" className="sr-only">
          Loading your basket…
        </p>
        <Skeleton className="h-9 w-56" />
        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </Container>
    );
  }

  if (lines.length === 0) {
    return (
      <Container className="py-12 sm:py-16">
        <EmptyState
          className="mx-auto max-w-2xl"
          icon={<ShoppingBasket aria-hidden="true" />}
          title="Your basket is empty"
          description="Browse the catalogue to add fittings, sprinklers, drip lines, valves and more — or describe your project and our sales team will quote it."
          action={
            <>
              <LinkButton href="/products">Browse the catalogue</LinkButton>
              <LinkButton href="/quote" variant="secondary">
                Describe your project
              </LinkButton>
            </>
          }
        />
      </Container>
    );
  }

  const checkout = () => router.push(session.status === 'authenticated' ? '/checkout' : '/login?next=/checkout');

  return (
    <Container className="py-8 sm:py-10">
      <PageHeader
        eyebrow="Basket"
        title="Your basket"
        description={`${pluralize(lines.length, 'product')} · request a quote for your best price, or check out at listed prices`}
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <Card className="min-w-0 overflow-hidden">
          <h2 className="sr-only">Products in your basket</h2>
          <ul className="divide-y divide-slate-200">
            {lines.map((line, index) => (
              <li key={line.productId} className="flex gap-4 p-4 sm:p-5">
                <Link
                  href={`/products/${line.slug}`}
                  tabIndex={-1}
                  aria-hidden="true"
                  className="size-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white sm:size-20"
                >
                  <ProductImage product={{ imageUrl: line.imageUrl ?? null, name: line.name }} alt="" className="size-full object-contain p-1.5" />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-slate-600">{line.sku}</p>
                      <Link href={`/products/${line.slug}`} className="line-clamp-2 font-medium text-ink-900 hover:text-brand-700">
                        {line.name}
                      </Link>
                      <p className="mt-0.5 text-xs text-slate-600">
                        Listed price {aed(line.retailPrice)} / {UOM_LABELS[line.uom]} incl. VAT
                        {line.isTradeOnly && <span className="ml-2 font-medium text-brand-700">Trade only</span>}
                      </p>
                    </div>
                    <IconButton label={`Remove ${line.name}`} size="sm" onClick={() => removeFromCart(line.productId)}>
                      <Trash aria-hidden="true" />
                    </IconButton>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <QuantityInput
                        id={`basket-quantity-${line.productId}`}
                        label={`Quantity of ${line.name}`}
                        size="sm"
                        value={line.quantity}
                        min={line.minOrderQty}
                        onChange={(quantity) => setQuantity(line.productId, quantity)}
                      />
                      <span className="text-sm text-slate-600">{UOM_LABELS[line.uom]}</span>
                    </div>
                    <p className="font-semibold tabular-nums text-ink-900">
                      <span className="sr-only">Line total: </span>
                      {aed(fromFils(totals.lines[index]?.lineTotalFils ?? 0))}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-6">
          {!trade && (
            <Card tone="brand" className="p-5 sm:p-6">
              <p className="eyebrow text-brand-700">Best price</p>
              <h2 className="heading-3 mt-2">Request a quote for this basket</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">
                Catalogue prices marked ≈ are approximate market prices. Our sales team replies with a formal quotation for your quantities — project
                quantities are priced individually.
              </p>
              <LinkButton href="/quote" size="lg" className="mt-5 w-full">
                <FileText aria-hidden="true" />
                Request a quote (best price)
              </LinkButton>
            </Card>
          )}

          <Card className="p-5 sm:p-6">
            <h2 className="heading-3">{trade ? 'Order summary' : 'Or buy now at listed prices'}</h2>
            <div className="mt-4">
              <OrderSummary lines={lines} />
            </div>
            {tradeOnlyLines.length > 0 ? (
              <Alert tone="warning" className="mt-5">
                Trade-only items can only be supplied on quotation. Remove them to check out online.
              </Alert>
            ) : (
              <Button size="lg" variant="secondary" className="mt-5 w-full" onClick={checkout}>
                {trade ? 'Buy now as a personal order' : 'Checkout at listed prices'}
              </Button>
            )}
            {!trade && (
              <p className="mt-4 text-center text-xs text-slate-600">
                Buying for a business?{' '}
                <Link href="/register?type=business" className="font-medium text-brand-700 underline-offset-4 hover:underline">
                  Open a trade account
                </Link>
              </p>
            )}
          </Card>

          {trade && <RfqPanel />}
        </div>
      </div>
    </Container>
  );
}
