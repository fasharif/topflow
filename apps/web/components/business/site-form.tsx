'use client';

import { EMIRATE_LABELS, Emirate, addressSchema, enumValues, type AddressDto } from '@topflow/shared';
import { useId, useState, type FormEvent } from 'react';
import { Alert, Button, Field, Input, Select } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from '@/lib/forms';

interface SiteDraft {
  label: string;
  contactName: string;
  phoneNumber: string;
  line1: string;
  line2: string;
  area: string;
  city: string;
  emirate: Emirate;
  isDefault: boolean;
}

type TextKey = Exclude<keyof SiteDraft, 'emirate' | 'isDefault'>;

function toDraft(site?: AddressDto): SiteDraft {
  return {
    label: site?.label ?? '',
    contactName: site?.contactName ?? '',
    phoneNumber: site?.phoneNumber ?? '',
    line1: site?.line1 ?? '',
    line2: site?.line2 ?? '',
    area: site?.area ?? '',
    city: site?.city ?? '',
    emirate: site?.emirate ?? Emirate.DUBAI,
    isDefault: site?.isDefault ?? false,
  };
}

/** Create or edit an organization delivery site (validated with the shared address schema). */
export function SiteForm({ site, onSaved, onCancel }: { site?: AddressDto; onSaved: (site: AddressDto) => void; onCancel: () => void }) {
  const uid = useId();
  const [draft, setDraft] = useState<SiteDraft>(() => toDraft(site));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const parsed = addressSchema.safeParse(draft);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const saved = await api<AddressDto>(site ? `/org/addresses/${site.id}` : '/org/addresses', {
        method: site ? 'PATCH' : 'POST',
        org: true,
        body: parsed.data,
      });
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err));
      setErrors(apiFieldErrors(err));
      setSaving(false);
    }
  };

  const text = (key: TextKey, label: string, options: { placeholder?: string; className?: string; autoComplete?: string; type?: string } = {}) => (
    <Field label={label} htmlFor={`${uid}-${key}`} error={errors[key]} className={options.className}>
      <Input
        id={`${uid}-${key}`}
        type={options.type ?? 'text'}
        value={draft[key]}
        placeholder={options.placeholder}
        autoComplete={options.autoComplete}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        aria-invalid={Boolean(errors[key])}
      />
    </Field>
  );

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        {text('label', 'Site name', { placeholder: 'e.g. Dubai Hills — Phase 2 compound', className: 'sm:col-span-2' })}
        {text('contactName', 'Site contact', { autoComplete: 'name' })}
        {text('phoneNumber', 'Contact mobile', { placeholder: '+971 50 123 4567', autoComplete: 'tel', type: 'tel' })}
        {text('line1', 'Street, building or plot', { className: 'sm:col-span-2' })}
        {text('line2', 'Gate / landmark (optional)', { className: 'sm:col-span-2' })}
        {text('area', 'Area / community')}
        {text('city', 'City')}
        <Field label="Emirate" htmlFor={`${uid}-emirate`} error={errors.emirate}>
          <Select id={`${uid}-emirate`} value={draft.emirate} onChange={(e) => setDraft({ ...draft, emirate: e.target.value as Emirate })}>
            {enumValues(Emirate).map((value) => (
              <option key={value} value={value}>
                {EMIRATE_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={draft.isDefault}
              disabled={site?.isDefault}
              onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })}
              className="size-4 accent-brand-600"
            />
            {site?.isDefault ? 'This is the default delivery site' : 'Use as the default delivery site'}
          </label>
        </div>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          {site ? 'Save changes' : 'Add delivery site'}
        </Button>
      </div>
    </form>
  );
}
