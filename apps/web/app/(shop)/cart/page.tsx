'use client';

import { UOM_LABELS, fromFils, type AddressDto, type RfqDto } from '@topflow/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { OrderSummary, retailTotals } from '@/components/cart/order-summary';
import { Alert, Button, Card, CardHeader, EmptyState, Field, Input, LinkButton, PageHeader, Select, Textarea } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { clearCart, removeFromCart, setQuantity, useCart } from '@/lib/cart';
import { aed } from '@/lib/format';
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
      <CardHeader title="Request a trade quotation" description={`On behalf of ${activeMembership?.organizationName}. Trade prices are applied on your quotation.`} />
      <div className="space-y-4 p-5">
        <Field label="Project reference" htmlFor="projectReference" hint="Shown on the quotation and delivery paperwork">
          <Input id="projectReference" value={projectReference} onChange={(e) => setProjectReference(e.target.value)} placeholder="e.g. Dubai Hills — Phase 2" />
        </Field>
        <Field label="Delivery site" htmlFor="site">
          <Select id="site" value={addressId} onChange={(e) => setAddressId(e.target.value)}>
            <option value="">To be confirmed</option>
            {sites.data?.map((site) => (
              <option key={site.id} value={site.id}>
                {site.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Required by" htmlFor="requiredBy">
          <Input id="requiredBy" type="date" value={requiredBy} onChange={(e) => setRequiredBy(e.target.value)} />
        </Field>
        <Field label="Notes for our sales team" htmlFor="notes">
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
  const { lines, itemCount } = useCart();
  const session = useSession();
  const tradeOnlyLines = lines.filter((line) => line.isTradeOnly);
  const totals = retailTotals(lines);

  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <EmptyState title="Your cart is empty" description="Browse the catalog to add sprinklers, drip lines, valves and more." action={<LinkButton href="/products">Browse products</LinkButton>} />
      </div>
    );
  }

  const checkout = () => router.push(session.status === 'authenticated' ? '/checkout' : '/login?next=/checkout');

  return (
    <div>
      <PageHeader title="Your cart" description={`${itemCount} item${itemCount === 1 ? '' : 's'}`} />
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <Card>
          <ul className="divide-y divide-slate-100">
            {lines.map((line, index) => (
              <li key={line.productId} className="flex flex-wrap items-center gap-4 p-4 sm:flex-nowrap">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs text-slate-400">{line.sku}</p>
                  <Link href={`/products/${line.slug}`} className="font-medium text-ink-900 hover:text-brand-700">
                    {line.name}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {aed(line.retailPrice)} / {UOM_LABELS[line.uom]} incl. VAT
                    {line.isTradeOnly && <span className="ml-2 font-medium text-brand-700">Trade only</span>}
                  </p>
                </div>
                <Input
                  type="number"
                  min={line.minOrderQty}
                  value={line.quantity}
                  onChange={(e) => setQuantity(line.productId, Math.max(line.minOrderQty, Number(e.target.value)))}
                  className="w-20"
                  aria-label={`Quantity for ${line.name}`}
                />
                <p className="w-28 text-right font-semibold text-ink-900">
                  {aed(fromFils((totals.lines[index]?.lineTotalFils ?? 0)))}
                </p>
                <Button variant="ghost" size="sm" onClick={() => removeFromCart(line.productId)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-4 font-semibold text-ink-900">Order summary</h2>
            <OrderSummary lines={lines} />
            {tradeOnlyLines.length > 0 ? (
              <Alert tone="warning">Trade-only items can only be supplied on quotation. Remove them to check out online.</Alert>
            ) : (
              <Button className="mt-5 w-full" size="lg" onClick={checkout}>
                {session.activeMembership ? 'Buy now as a personal order' : 'Checkout'}
              </Button>
            )}
          </Card>

          {session.activeMembership ? (
            <RfqPanel />
          ) : (
            <p className="text-center text-sm text-slate-600">
              Buying for a business?{' '}
              <Link href="/register?type=business" className="font-medium text-brand-700 hover:underline">
                Open a trade account
              </Link>{' '}
              to request quotations.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
