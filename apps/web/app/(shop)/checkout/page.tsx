'use client';

import { EMIRATE_LABELS, Emirate, addressSchema, type AddressDto, type OrderDto } from '@topflow/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { OrderSummary } from '@/components/cart/order-summary';
import { RequireAuth } from '@/components/require-auth';
import { Alert, Button, Card, CardHeader, EmptyState, Field, Input, LinkButton, LoadingBlock, PageHeader, Select, Textarea, cx } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { clearCart, useCart } from '@/lib/cart';
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from '@/lib/forms';
import { useSession } from '@/lib/session';
import { useApiQuery } from '@/lib/use-api';

const EMPTY_ADDRESS = { label: 'Home', contactName: '', phoneNumber: '', line1: '', line2: '', area: '', city: '', emirate: Emirate.DUBAI as Emirate };

function CheckoutForm() {
  const router = useRouter();
  const { lines } = useCart();
  const { user } = useSession();
  const addresses = useApiQuery<AddressDto[]>('/me/addresses');
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState({ ...EMPTY_ADDRESS, contactName: user?.fullName ?? '', phoneNumber: user?.phoneNumber ?? '' });
  const [saveAddress, setSaveAddress] = useState(true);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);

  if (addresses.loading && !addresses.data) return <LoadingBlock />;
  if (lines.length === 0) {
    return <EmptyState title="Your basket is empty" action={<LinkButton href="/products">Browse the catalogue</LinkButton>} />;
  }

  const saved = addresses.data ?? [];
  const addressId = selected ?? saved.find((a) => a.isDefault)?.id ?? null;
  const useNew = saved.length === 0 || addressId === 'new';

  const placeOrder = async () => {
    setError(null);
    setErrors({});
    let address: typeof draft | undefined;
    if (useNew) {
      const parsed = addressSchema.safeParse(draft);
      if (!parsed.success) {
        setErrors(zodFieldErrors(parsed.error));
        return;
      }
      address = draft;
    }
    setPlacing(true);
    try {
      const order = await api<OrderDto>('/me/orders', {
        method: 'POST',
        body: {
          items: lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
          ...(useNew ? { address, saveAddress } : { addressId }),
          paymentMethod: 'CASH_ON_DELIVERY',
          notes,
        },
      });
      clearCart();
      router.push(`/account/orders/${order.id}?placed=1`);
    } catch (err) {
      setError(errorMessage(err));
      setErrors(apiFieldErrors(err));
      setPlacing(false);
    }
  };

  const input = (key: keyof typeof draft, label: string, props: { placeholder?: string; className?: string } = {}) => (
    <Field label={label} htmlFor={key} error={errors[`address.${key}`] ?? errors[key]} className={props.className}>
      <Input id={key} value={draft[key]} placeholder={props.placeholder} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} aria-invalid={Boolean(errors[key])} />
    </Field>
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <Card>
          <CardHeader title="Delivery address" />
          <div className="space-y-3 p-5">
            {saved.map((a) => (
              <label key={a.id} className={cx('flex cursor-pointer gap-3 rounded-lg border p-3', addressId === a.id ? 'border-brand-500 bg-brand-50/50' : 'border-slate-200')}>
                <input type="radio" name="address" checked={addressId === a.id} onChange={() => setSelected(a.id)} className="mt-1 accent-brand-600" />
                <span className="text-sm">
                  <span className="font-medium text-ink-900">{a.label}</span> · {a.contactName}, {a.phoneNumber}
                  <br />
                  <span className="text-slate-600">
                    {a.line1}, {a.area}, {a.city}, {EMIRATE_LABELS[a.emirate]}
                  </span>
                </span>
              </label>
            ))}
            {saved.length > 0 && (
              <label className={cx('flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm', useNew ? 'border-brand-500 bg-brand-50/50' : 'border-slate-200')}>
                <input type="radio" name="address" checked={useNew} onChange={() => setSelected('new')} className="accent-brand-600" />
                Deliver to a new address
              </label>
            )}

            {useNew && (
              <div className="grid gap-4 pt-2 sm:grid-cols-2">
                {input('contactName', 'Contact name')}
                {input('phoneNumber', 'Mobile number', { placeholder: '+971 50 123 4567' })}
                {input('line1', 'Street, building or villa', { className: 'sm:col-span-2' })}
                {input('line2', 'Apartment / landmark (optional)', { className: 'sm:col-span-2' })}
                {input('area', 'Area / community')}
                {input('city', 'City')}
                <Field label="Emirate" htmlFor="emirate">
                  <Select id="emirate" value={draft.emirate} onChange={(e) => setDraft({ ...draft, emirate: e.target.value as Emirate })}>
                    {Object.entries(EMIRATE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
                {input('label', 'Save as', { placeholder: 'Home, Office…' })}
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} className="size-4 accent-brand-600" />
                  Save this address for next time
                </label>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Payment" />
          <div className="space-y-3 p-5 text-sm">
            <label className="flex items-center gap-3 rounded-lg border border-brand-500 bg-brand-50/50 p-3">
              <input type="radio" checked readOnly className="accent-brand-600" />
              <span>
                <span className="font-medium text-ink-900">Pay on delivery</span> — cash or card to the driver
              </span>
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-slate-400">
              <input type="radio" disabled />
              Online card payment (coming soon)
            </label>
            <Field label="Delivery notes (optional)" htmlFor="notes">
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Gate code, preferred time…" />
            </Field>
          </div>
        </Card>
      </div>

      <Card className="h-fit p-5">
        <h2 className="mb-4 font-semibold text-ink-900">Order summary</h2>
        <ul className="mb-4 space-y-1 text-sm text-slate-600">
          {lines.map((line) => (
            <li key={line.productId} className="flex justify-between gap-2">
              <span className="truncate">
                {line.quantity} × {line.name}
              </span>
            </li>
          ))}
        </ul>
        <OrderSummary lines={lines} />
        {error && (
          <div className="mt-4">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}
        <Button className="mt-5 w-full" size="lg" loading={placing} onClick={placeOrder}>
          Place order
        </Button>
        <p className="mt-3 text-center text-xs text-slate-500">Prices are confirmed by Top Flow when you place the order.</p>
      </Card>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <RequireAuth>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <PageHeader eyebrow="Checkout" title="Delivery & payment" />
        <CheckoutForm />
      </div>
    </RequireAuth>
  );
}
