'use client';

import { ORG_TYPE_LABELS, OrgType, registerOrganizationSchema, type AuthUser } from '@topflow/shared';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Card, Field, Input, Select } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from '@/lib/forms';
import { setActiveOrganization, updateUser } from '@/lib/session';

const EMPTY = { name: '', legalName: '', type: OrgType.CONTRACTOR as OrgType, tradeLicenseNumber: '', trn: '', email: '', phoneNumber: '' };
type TextField = Exclude<keyof typeof EMPTY, 'type'>;

/** A signed-in customer opens a trade account; Top Flow verifies it before quotations can be accepted. */
export function TradeAccountForm() {
  const router = useRouter();
  const [org, setOrg] = useState(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const parsed = registerOrganizationSchema.safeParse({
      ...org,
      legalName: org.legalName || undefined,
      trn: org.trn || undefined,
      email: org.email || undefined,
      phoneNumber: org.phoneNumber || undefined,
    });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const user = await api<AuthUser>('/me/organizations', { method: 'POST', body: parsed.data });
      updateUser(user);
      const created = user.memberships.at(-1);
      if (created) setActiveOrganization(created.organizationId);
      router.replace('/business?welcome=1');
    } catch (err) {
      setError(errorMessage(err));
      setErrors(apiFieldErrors(err));
      setSaving(false);
    }
  };

  const field = (key: TextField, label: string, options: { type?: string; hint?: string; placeholder?: string } = {}) => (
    <Field label={label} htmlFor={`trade-${key}`} error={errors[key]} hint={options.hint}>
      <Input
        id={`trade-${key}`}
        type={options.type ?? 'text'}
        placeholder={options.placeholder}
        value={org[key]}
        onChange={(e) => setOrg({ ...org, [key]: e.target.value })}
        aria-invalid={Boolean(errors[key])}
      />
    </Field>
  );

  return (
    <Card className="p-5">
      <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">{field('name', 'Company name')}</div>
        <Field label="Business type" htmlFor="trade-type">
          <Select id="trade-type" value={org.type} onChange={(e) => setOrg({ ...org, type: e.target.value as OrgType })}>
            {Object.entries(ORG_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        {field('tradeLicenseNumber', 'Trade licence number')}
        {field('trn', 'VAT TRN (optional)', { hint: '15 digits — printed on your quotations and invoices' })}
        {field('legalName', 'Legal name (optional)')}
        {field('email', 'Procurement email (optional)', { type: 'email', hint: 'Defaults to your own email address' })}
        {field('phoneNumber', 'Company phone (optional)', { type: 'tel', placeholder: '+971 4 123 4567' })}

        <div className="sm:col-span-2 space-y-4">
          <Alert tone="info">Top Flow reviews trade accounts before quotations can be accepted. You can request quotations straight away.</Alert>
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="flex justify-end">
            <Button type="submit" loading={saving}>
              Submit for verification
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}
