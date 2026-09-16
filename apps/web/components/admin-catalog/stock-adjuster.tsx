'use client';

import { UOM_LABELS, adjustStockSchema, type ProductDto } from '@topflow/shared';
import { useId, useState, type FormEvent } from 'react';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from '@/lib/forms';
import { parseWholeNumber } from './helpers';

/** Inline stock count for one product: PATCH /admin/products/:id/stock (recorded in the audit trail). */
export function StockAdjuster({ product, onSaved, onCancel }: { product: ProductDto; onSaved: (product: ProductDto) => void; onCancel: () => void }) {
  const baseId = useId();
  const [quantity, setQuantity] = useState(String(product.stockQuantity));
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const count = parseWholeNumber(quantity);
  const delta = count === null ? 0 : count - product.stockQuantity;
  const unit = UOM_LABELS[product.uom];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (count === null) {
      setErrors({ stockQuantity: 'Enter a whole number, 0 or more' });
      return;
    }
    const parsed = adjustStockSchema.safeParse({ stockQuantity: count, note });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      onSaved(await api<ProductDto>(`/admin/products/${product.id}/stock`, { method: 'PATCH', body: parsed.data }));
    } catch (err) {
      setError(errorMessage(err));
      setErrors(apiFieldErrors(err));
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !saving) onCancel();
      }}
      className="space-y-3"
      aria-label={`Adjust stock for ${product.name}`}
    >
      <div className="flex flex-wrap items-start gap-3">
        <Field label={`New stock count (${unit})`} htmlFor={`${baseId}-quantity`} error={errors.stockQuantity} className="w-44">
          <Input
            id={`${baseId}-quantity`}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            autoFocus
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            aria-invalid={Boolean(errors.stockQuantity)}
          />
        </Field>
        <Field label="Note" optional htmlFor={`${baseId}-note`} error={errors.note} className="min-w-56 flex-1">
          <Input
            id={`${baseId}-note`}
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Cycle count, damaged units written off"
            aria-invalid={Boolean(errors.note)}
          />
        </Field>
        <div className="flex gap-2 sm:pt-6.5">
          <Button type="submit" loading={saving}>
            Save count
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        </div>
      </div>
      <p className="text-xs text-slate-600">
        Currently {product.stockQuantity} {unit}
        {count !== null && delta !== 0 && (
          <span className={delta > 0 ? 'font-medium text-success-700' : 'font-medium text-warning-700'}>
            {' '}
            ({delta > 0 ? '+' : ''}
            {delta})
          </span>
        )}
        . Availability updates automatically: a count of 0 marks the product as on order.
      </p>
      {error && <Alert tone="danger">{error}</Alert>}
    </form>
  );
}
