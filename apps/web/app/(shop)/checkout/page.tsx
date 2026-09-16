'use client';

import { EMIRATE_LABELS, Emirate, addressSchema, type AddressDto, type OrderDto } from '@topflow/shared';
import { Banknote, CreditCard, ShoppingBasket } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { OrderSummary } from '@/components/cart/order-summary';
import { RequireAuth } from '@/components/require-auth';
import { Alert, Button, Card, CardHeader, Container, EmptyState, Field, Input, LinkButton, LoadingBlock, PageHeader, Select, Textarea, cx } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { clearCart, useCart } from '@/lib/cart';
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from '@/lib/forms';
import { useSession } from '@/lib/session';
import { useApiQuery } from '@/lib/use-api';

const EMPTY_ADDRESS = { label: 'Home', contactName: '', phoneNumber: '', line1: '', line2: '', area: '', city: '', emirate: Emirate.DUBAI as Emirate };

const choiceClass = (selected: boolean) =>
  cx(
    'flex cursor-pointer gap-3 rounded-lg border p-3.5 transition-colors',
    selected ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600 ring-inset' : 'border-slate-300 bg-white hover:border-slate-400',
  );

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
    return (
      <EmptyState
        icon={<ShoppingBasket aria-hidden="true" />}
        title="Your basket is empty"
        action={<LinkButton href="/products">Browse the catalogue</LinkButton>}
      />
    );
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

  const input = (
    key: keyof typeof draft,
    label: string,
    props: { placeholder?: string; className?: string; autoComplete?: string; optional?: boolean } = {},
  ) => {
    const fieldError = errors[`address.${key}`] ?? errors[key];
    return (
      <Field label={label} htmlFor={key} error={fieldError} className={props.className} optional={props.optional}>
        <Input
          id={key}
          value={draft[key]}
          placeholder={props.placeholder}
          autoComplete={props.autoComplete}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
          aria-invalid={Boolean(fieldError)}
        />
      </Field>
    );
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      <div className="space-y-6">
        <Card>
          <CardHeader title="Delivery address" />
          <div className="space-y-3 p-5">
            {saved.length > 0 && (
              <div role="radiogroup" aria-label="Delivery address" className="space-y-3">
                {saved.map((a) => (
                  <label key={a.id} className={choiceClass(addressId === a.id)}>
                    <input type="radio" name="address" checked={addressId === a.id} onChange={() => setSelected(a.id)} className="mt-1 size-4 shrink-0" />
                    <span className="text-sm">
                      <span className="font-medium text-ink-900">{a.label}</span> · {a.contactName}, {a.phoneNumber}
                      <br />
                      <span className="text-slate-600">
                        {a.line1}, {a.area}, {a.city}, {EMIRATE_LABELS[a.emirate]}
                      </span>
                    </span>
                  </label>
                ))}
                <label className={cx(choiceClass(useNew), 'items-center text-sm')}>
                  <input type="radio" name="address" checked={useNew} onChange={() => setSelected('new')} className="size-4 shrink-0" />
                  Deliver to a new address
                </label>
              </div>
            )}

            {useNew && (
              <div className="grid gap-4 pt-2 sm:grid-cols-2">
                {input('contactName', 'Contact name', { autoComplete: 'name' })}
                {input('phoneNumber', 'Mobile number', { placeholder: '+971 50 123 4567', autoComplete: 'tel' })}
                {input('line1', 'Street, building or villa', { className: 'sm:col-span-2', autoComplete: 'address-line1' })}
                {input('line2', 'Apartment / landmark', { className: 'sm:col-span-2', autoComplete: 'address-line2', optional: true })}
                {input('area', 'Area / community', { autoComplete: 'address-level3' })}
                {input('city', 'City', { autoComplete: 'address-level2' })}
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
                <label className="flex items-center gap-2.5 text-sm text-ink-900 sm:col-span-2">
                  <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} className="size-4" />
                  Save this address for next time
                </label>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Payment" />
          <div className="space-y-3 p-5 text-sm">
            <label className={cx(choiceClass(true), 'items-center')}>
              <input type="radio" checked readOnly className="size-4 shrink-0" />
              <Banknote aria-hidden="true" className="size-5 shrink-0 text-brand-700" />
              <span>
                <span className="font-medium text-ink-900">Pay on delivery</span> — cash or card to the driver
              </span>
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-slate-500">
              <input type="radio" disabled className="size-4 shrink-0" />
              <CreditCard aria-hidden="true" className="size-5 shrink-0" />
              Online card payment (coming soon)
            </label>
            <Field label="Delivery notes" htmlFor="notes" optional>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Gate code, preferred time…" />
            </Field>
          </div>
        </Card>
      </div>

      <Card className="p-5 sm:p-6 lg:sticky lg:top-32">
        <h2 className="heading-3">Order summary</h2>
        <ul className="mt-4 space-y-1.5 border-b border-slate-200 pb-4 text-sm text-slate-600">
          {lines.map((line) => (
            <li key={line.productId} className="truncate">
              {line.quantity} × {line.name}
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <OrderSummary lines={lines} />
        </div>
        {error && (
          <Alert tone="danger" className="mt-4">
            {error}
          </Alert>
        )}
        <Button className="mt-5 w-full" size="lg" loading={placing} onClick={placeOrder}>
          Place order
        </Button>
        <p className="mt-3 text-center text-xs text-slate-600">Prices are confirmed by Top Flow when you place the order.</p>
      </Card>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <RequireAuth>
      <Container className="py-8 sm:py-10">
        <PageHeader
          breadcrumbs={[
            { label: 'Basket', href: '/cart' },
            { label: 'Checkout' },
          ]}
          title="Delivery & payment"
          description="Choose where to deliver and pay by cash or card when your order arrives."
        />
        <CheckoutForm />
      </Container>
    </RequireAuth>
  );
}
