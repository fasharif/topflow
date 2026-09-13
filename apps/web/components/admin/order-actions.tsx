'use client';

import {
  ORDER_STATUS_LABELS,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Permission,
  cancelOrderSchema,
  hasPermission,
  recordPaymentSchema,
  updateOrderStatusSchema,
  type OrderDto,
} from '@topflow/shared';
import { useState } from 'react';
import { Alert, Button, Card, CardHeader, Field, Input, Textarea } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from '@/lib/forms';
import { useSession } from '@/lib/session';

type Mode = { kind: 'transition'; status: OrderStatus } | { kind: 'cancel' } | { kind: 'payment' };

const TRANSITION_HINTS: Partial<Record<OrderStatus, string>> = {
  CONFIRMED: 'Confirms the order and notifies the customer.',
  PROCESSING: 'The warehouse starts picking and packing.',
  DISPATCHED: 'Stock is deducted for every line as the goods leave the warehouse.',
  DELIVERED: 'Completes the order.',
};

/**
 * Fulfilment actions for staff. Only transitions the API reports as allowed for the caller are
 * offered; the API still enforces every rule (e.g. 409 when stock is insufficient to dispatch).
 */
export function OrderActions({ order, onUpdated }: { order: OrderDto; onUpdated: (order: OrderDto) => void }) {
  const { user } = useSession();
  const [mode, setMode] = useState<Mode | null>(null);
  const [note, setNote] = useState('');
  const [trackingReference, setTrackingReference] = useState('');
  const [reason, setReason] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const transitions = order.allowedTransitions.filter((status) => status !== OrderStatus.CANCELLED);
  const canRecordPayment =
    hasPermission(user?.role, Permission.ORDERS_MANAGE) && order.paymentStatus === PaymentStatus.UNPAID && order.status !== OrderStatus.CANCELLED;
  const hasActions = transitions.length > 0 || order.canCancel || canRecordPayment;
  const closed = order.status === OrderStatus.DELIVERED || order.status === OrderStatus.CANCELLED;
  const collectsCashOnDelivery = order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY && order.paymentStatus === PaymentStatus.UNPAID;

  const open = (next: Mode) => {
    setMode(next);
    setNote('');
    setTrackingReference(order.trackingReference ?? '');
    setReason('');
    setPaymentReference('');
    setErrors({});
    setError(null);
    setNotice(null);
  };

  const close = () => {
    setMode(null);
    setErrors({});
    setError(null);
  };

  const run = async (request: () => Promise<OrderDto>, success: string) => {
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      onUpdated(await request());
      setMode(null);
      setNotice(success);
    } catch (err) {
      setError(errorMessage(err));
      setErrors(apiFieldErrors(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmTransition = (status: OrderStatus) => {
    const parsed = updateOrderStatusSchema.safeParse({
      status,
      note,
      trackingReference: status === OrderStatus.DISPATCHED ? trackingReference : undefined,
    });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    void run(
      () => api<OrderDto>(`/admin/orders/${order.id}/status`, { method: 'PATCH', body: parsed.data }),
      `Order marked as ${ORDER_STATUS_LABELS[status].toLowerCase()}.`,
    );
  };

  const confirmCancel = () => {
    const parsed = cancelOrderSchema.safeParse({ reason });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    void run(
      () => api<OrderDto>(`/admin/orders/${order.id}/status`, { method: 'PATCH', body: { status: OrderStatus.CANCELLED, note: parsed.data.reason } }),
      'Order cancelled. The customer has been notified.',
    );
  };

  const confirmPayment = () => {
    const parsed = recordPaymentSchema.safeParse({ paymentReference });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    void run(() => api<OrderDto>(`/admin/orders/${order.id}/payment`, { method: 'POST', body: parsed.data }), 'Payment recorded.');
  };

  const formButtons = (label: string, onConfirm: () => void, variant: 'primary' | 'danger' = 'primary') => (
    <div className="flex flex-wrap gap-2">
      <Button variant={variant} loading={busy} onClick={onConfirm}>
        {label}
      </Button>
      <Button variant="ghost" onClick={close} disabled={busy}>
        Back
      </Button>
    </div>
  );

  return (
    <Card>
      <CardHeader title="Actions" description={hasActions ? 'What your role can do at this stage.' : undefined} />
      <div className="space-y-4 p-5">
        {notice && <Alert tone="success">{notice}</Alert>}

        {mode === null &&
          (hasActions ? (
            <div className="flex flex-col gap-2">
              {transitions.map((status) => (
                <Button key={status} onClick={() => open({ kind: 'transition', status })}>
                  Mark as {ORDER_STATUS_LABELS[status]}
                </Button>
              ))}
              {canRecordPayment && (
                <Button variant="secondary" onClick={() => open({ kind: 'payment' })}>
                  Record payment
                </Button>
              )}
              {order.canCancel && (
                <button
                  type="button"
                  onClick={() => open({ kind: 'cancel' })}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-red-200 bg-white px-4 text-sm font-medium text-red-700 transition hover:bg-red-50"
                >
                  Cancel order
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              {closed ? 'This order is closed — there is nothing left to do.' : 'Nothing for your role to do at this stage.'}
            </p>
          ))}

        {mode?.kind === 'transition' && (
          <div className="space-y-4">
            <div>
              <p className="font-medium text-ink-900">Mark as {ORDER_STATUS_LABELS[mode.status]}</p>
              <p className="mt-0.5 text-sm text-slate-500">
                {TRANSITION_HINTS[mode.status]}
                {mode.status === OrderStatus.DELIVERED && collectsCashOnDelivery && ' Cash on delivery will be recorded as collected.'}
              </p>
            </div>
            {mode.status === OrderStatus.DISPATCHED && (
              <Field label="Tracking reference" htmlFor="trackingReference" error={errors.trackingReference} hint="Courier or delivery-note number, shared with the customer.">
                <Input
                  id="trackingReference"
                  value={trackingReference}
                  onChange={(event) => setTrackingReference(event.target.value)}
                  maxLength={100}
                  aria-invalid={Boolean(errors.trackingReference)}
                />
              </Field>
            )}
            <Field label="Note (optional)" htmlFor="transitionNote" error={errors.note} hint="Added to the timeline and the customer email.">
              <Textarea id="transitionNote" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} aria-invalid={Boolean(errors.note)} />
            </Field>
            {error && <Alert tone="danger">{error}</Alert>}
            {formButtons(`Mark as ${ORDER_STATUS_LABELS[mode.status]}`, () => confirmTransition(mode.status))}
          </div>
        )}

        {mode?.kind === 'cancel' && (
          <div className="space-y-4">
            <div>
              <p className="font-medium text-ink-900">Cancel this order</p>
              <p className="mt-0.5 text-sm text-slate-500">The customer is emailed with your reason. This cannot be undone.</p>
            </div>
            <Field label="Reason" htmlFor="cancelReason" error={errors.reason ?? errors.note}>
              <Textarea
                id="cancelReason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
                placeholder="e.g. Customer asked to cancel — duplicate order"
                aria-invalid={Boolean(errors.reason ?? errors.note)}
              />
            </Field>
            {error && <Alert tone="danger">{error}</Alert>}
            {formButtons('Cancel order', confirmCancel, 'danger')}
          </div>
        )}

        {mode?.kind === 'payment' && (
          <div className="space-y-4">
            <div>
              <p className="font-medium text-ink-900">Record payment</p>
              <p className="mt-0.5 text-sm text-slate-500">
                Marks the order as paid.
                {order.status === OrderStatus.PENDING_PAYMENT && ' The order is confirmed automatically.'}
              </p>
            </div>
            <Field label="Payment reference (optional)" htmlFor="paymentReference" error={errors.paymentReference} hint="Bank transfer reference, receipt or card slip number.">
              <Input
                id="paymentReference"
                value={paymentReference}
                onChange={(event) => setPaymentReference(event.target.value)}
                maxLength={100}
                aria-invalid={Boolean(errors.paymentReference)}
              />
            </Field>
            {error && <Alert tone="danger">{error}</Alert>}
            {formButtons('Record payment', confirmPayment)}
          </div>
        )}
      </div>
    </Card>
  );
}
