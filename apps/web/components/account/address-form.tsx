'use client';

import { EMIRATE_LABELS, Emirate, addressSchema, updateAddressSchema, type AddressDto } from '@topflow/shared';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Field, Input, Select } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from '@/lib/forms';

export interface AddressFormValues {
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

type TextField = Exclude<keyof AddressFormValues, 'emirate' | 'isDefault'>;

interface TextOptions {
  placeholder?: string;
  className?: string;
  type?: string;
  autoComplete?: string;
  optional?: boolean;
}

function initialValues(address: AddressDto | undefined, defaults: Partial<AddressFormValues>): AddressFormValues {
  if (address) {
    return {
      label: address.label,
      contactName: address.contactName,
      phoneNumber: address.phoneNumber,
      line1: address.line1,
      line2: address.line2 ?? '',
      area: address.area,
      city: address.city,
      emirate: address.emirate,
      isDefault: address.isDefault,
    };
  }
  return { label: '', contactName: '', phoneNumber: '', line1: '', line2: '', area: '', city: '', emirate: Emirate.DUBAI, isDefault: false, ...defaults };
}

/** Create (POST /me/addresses) or edit (PATCH /me/addresses/:id) a saved address. */
export function AddressForm({
  address,
  defaults = {},
  firstAddress = false,
  onSaved,
  onCancel,
}: {
  /** Edit this address; omit to create a new one. */
  address?: AddressDto;
  defaults?: Partial<AddressFormValues>;
  /** The API always makes the first saved address the default. */
  firstAddress?: boolean;
  onSaved: (address: AddressDto) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState(() => initialValues(address, defaults));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Unticking the current default would leave no default at all — another address must be promoted instead.
  const defaultLocked = firstAddress || Boolean(address?.isDefault);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const parsed = address ? updateAddressSchema.safeParse(values) : addressSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const saved = await api<AddressDto>(address ? `/me/addresses/${address.id}` : '/me/addresses', {
        method: address ? 'PATCH' : 'POST',
        body: parsed.data,
      });
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err));
      setErrors(apiFieldErrors(err));
      setSaving(false);
    }
  };

  const text = (name: TextField, label: string, options: TextOptions = {}) => (
    <Field label={label} htmlFor={`address-${name}`} error={errors[name]} optional={options.optional} className={options.className}>
      <Input
        id={`address-${name}`}
        type={options.type}
        autoComplete={options.autoComplete}
        placeholder={options.placeholder}
        value={values[name]}
        onChange={(e) => setValues((current) => ({ ...current, [name]: e.target.value }))}
        aria-invalid={Boolean(errors[name])}
      />
    </Field>
  );

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        {text('contactName', 'Contact name', { autoComplete: 'name' })}
        {text('phoneNumber', 'Mobile number', { type: 'tel', autoComplete: 'tel', placeholder: '+971 50 123 4567' })}
        {text('line1', 'Street, building or villa', { className: 'sm:col-span-2', autoComplete: 'address-line1' })}
        {text('line2', 'Apartment, floor or landmark', { className: 'sm:col-span-2', autoComplete: 'address-line2', optional: true })}
        {text('area', 'Area / community', { placeholder: 'e.g. Al Barsha' })}
        {text('city', 'City', { autoComplete: 'address-level2' })}
        <Field label="Emirate" htmlFor="address-emirate" error={errors.emirate}>
          <Select id="address-emirate" value={values.emirate} onChange={(e) => setValues((current) => ({ ...current, emirate: e.target.value as Emirate }))}>
            {Object.entries(EMIRATE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        {text('label', 'Save as', { placeholder: 'Home, Office, Site…' })}
      </div>

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={values.isDefault}
          disabled={defaultLocked}
          onChange={(e) => setValues((current) => ({ ...current, isDefault: e.target.checked }))}
          className="mt-0.5 size-4 shrink-0 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <span>
          <span className="font-medium text-ink-900">Use as my default delivery address</span>
          {defaultLocked && (
            <span className="mt-0.5 block text-xs text-slate-600">
              {firstAddress ? 'Your first saved address is always the default.' : 'To change your default, make another address the default.'}
            </span>
          )}
        </span>
      </label>

      {error && <Alert tone="danger">{error}</Alert>}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          {address ? 'Save changes' : 'Save address'}
        </Button>
      </div>
    </form>
  );
}
