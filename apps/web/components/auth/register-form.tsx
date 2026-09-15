'use client';

import {
  ORG_TYPE_LABELS,
  OrgType,
  PASSWORD_MIN_LENGTH,
  registerBusinessSchema,
  registerSchema,
  type AuthSession,
} from '@topflow/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Field, Input, Select, cx } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from '@/lib/forms';
import { applySession } from '@/lib/session';

type AccountType = 'personal' | 'business';

export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [type, setType] = useState<AccountType>(params.get('type') === 'business' ? 'business' : 'personal');
  const [user, setUser] = useState({ fullName: '', email: '', phoneNumber: '', password: '', confirm: '' });
  const [org, setOrg] = useState({ name: '', legalName: '', type: OrgType.CONTRACTOR as OrgType, tradeLicenseNumber: '', trn: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const base = {
      fullName: user.fullName,
      email: user.email,
      password: user.password,
      phoneNumber: user.phoneNumber || undefined,
    };
    const payload =
      type === 'business'
        ? { ...base, organization: { ...org, legalName: org.legalName || undefined, trn: org.trn || undefined } }
        : base;
    const parsed = type === 'business' ? registerBusinessSchema.safeParse(payload) : registerSchema.safeParse(payload);
    const nextErrors: FieldErrors = parsed.success ? {} : zodFieldErrors(parsed.error);
    if (user.password !== user.confirm) nextErrors.confirm = 'Passwords do not match';
    setErrors(nextErrors);
    if (!parsed.success || nextErrors.confirm) return;

    setSubmitting(true);
    try {
      const session = await api<AuthSession>(type === 'business' ? '/auth/register/business' : '/auth/register', {
        method: 'POST',
        body: parsed.data,
      });
      applySession(session);
      router.replace(type === 'business' ? '/business?welcome=1' : '/account?welcome=1');
    } catch (err) {
      setError(errorMessage(err));
      setErrors(apiFieldErrors(err));
      setSubmitting(false);
    }
  };

  const userField = (key: keyof typeof user, label: string, inputType = 'text', autoComplete?: string, hint?: string) => (
    <Field label={label} htmlFor={key} error={errors[key]} hint={hint}>
      <Input id={key} type={inputType} autoComplete={autoComplete} value={user[key]} onChange={(e) => setUser({ ...user, [key]: e.target.value })} aria-invalid={Boolean(errors[key])} />
    </Field>
  );

  const orgField = (key: 'name' | 'legalName' | 'tradeLicenseNumber' | 'trn', label: string, hint?: string) => (
    <Field label={label} htmlFor={`org-${key}`} error={errors[`organization.${key}`]} hint={hint}>
      <Input id={`org-${key}`} value={org[key]} onChange={(e) => setOrg({ ...org, [key]: e.target.value })} aria-invalid={Boolean(errors[`organization.${key}`])} />
    </Field>
  );

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">Create your account</h1>
      <p className="mt-1 text-sm text-slate-500">Shop online, or apply for a trade account for your business.</p>

      <div className="mt-6 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-sm" role="tablist">
        {(['personal', 'business'] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={type === option}
            onClick={() => setType(option)}
            className={cx('rounded-md py-2 font-medium', type === option ? 'bg-white text-ink-900 shadow-sm' : 'text-slate-500')}
          >
            {option === 'personal' ? 'Personal' : 'Business / trade'}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        {type === 'business' && (
          <fieldset className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
            <legend className="px-1 text-sm font-semibold text-ink-900">Company details</legend>
            {orgField('name', 'Company name')}
            <Field label="Business type" htmlFor="org-type">
              <Select id="org-type" value={org.type} onChange={(e) => setOrg({ ...org, type: e.target.value as OrgType })}>
                {Object.entries(ORG_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            {orgField('tradeLicenseNumber', 'Trade licence number')}
            {orgField('trn', 'VAT TRN (optional)', '15 digits — printed on your quotations and invoices')}
            {orgField('legalName', 'Legal name (optional)')}
          </fieldset>
        )}

        {userField('fullName', type === 'business' ? 'Your full name' : 'Full name', 'text', 'name')}
        {userField('email', type === 'business' ? 'Work email' : 'Email', 'email', 'email')}
        {userField('phoneNumber', 'Mobile number (optional)', 'tel', 'tel')}
        {userField('password', 'Password', 'password', 'new-password', `At least ${PASSWORD_MIN_LENGTH} characters, with letters and numbers`)}
        {userField('confirm', 'Confirm password', 'password', 'new-password')}

        {type === 'business' && (
          <Alert tone="info">Top Flow verifies trade accounts before quotations can be accepted. You can browse and request quotations straight away.</Alert>
        )}
        {error && <Alert tone="danger">{error}</Alert>}

        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          {type === 'business' ? 'Apply for a trade account' : 'Create account'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
