'use client';

import { cancelOrderSchema, type OrderDto } from '@topflow/shared';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Card, CardHeader, Field, Textarea } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { apiFieldErrors, zodFieldErrors } from '@/lib/forms';

/** Two-step cancellation: reveal a reason box, then confirm. Hands the updated order back. */
export function CancelOrderCard({ orderId, onCancelled }: { orderId: string; onCancelled: (order: OrderDto) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const close = () => {
    setOpen(false);
    setReason('');
    setFieldError(undefined);
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const parsed = cancelOrderSchema.safeParse({ reason });
    if (!parsed.success) {
      setFieldError(zodFieldErrors(parsed.error).reason);
      return;
    }
    setFieldError(undefined);
    setSubmitting(true);
    try {
      onCancelled(await api<OrderDto>(`/me/orders/${orderId}/cancel`, { method: 'POST', body: parsed.data }));
    } catch (err) {
      setError(errorMessage(err));
      setFieldError(apiFieldErrors(err).reason);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Need to cancel?" description="You can cancel until our warehouse starts preparing your order." />
      <div className="p-5">
        {open ? (
          <form onSubmit={submit} className="space-y-3" noValidate>
            <Field label="Why are you cancelling?" htmlFor="cancel-reason" error={fieldError} hint="A few words are enough.">
              <Textarea
                id="cancel-reason"
                value={reason}
                maxLength={500}
                placeholder="e.g. I ordered the wrong part"
                autoFocus
                aria-invalid={Boolean(fieldError)}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            {error && <Alert tone="danger">{error}</Alert>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="danger" loading={submitting}>
                Confirm cancellation
              </Button>
              <Button variant="ghost" onClick={close} disabled={submitting}>
                Keep my order
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="secondary" className="w-full" onClick={() => setOpen(true)}>
            Cancel order
          </Button>
        )}
      </div>
    </Card>
  );
}
