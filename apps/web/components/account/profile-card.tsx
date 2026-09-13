'use client';

import { updateProfileSchema, type AuthUser } from '@topflow/shared';
import { useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Card, CardHeader, Field, Input } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from '@/lib/forms';
import { updateUser } from '@/lib/session';

export function ProfileCard({ user }: { user: AuthUser }) {
  const [fullName, setFullName] = useState(user.fullName);
  const [phoneNumber, setPhoneNumber] = useState(user.phoneNumber ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const dirty = fullName.trim() !== user.fullName || (phoneNumber.trim() || null) !== user.phoneNumber;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaved(false);
    // Clearing the phone field removes the number — the API accepts null for that.
    const parsed = updateProfileSchema.safeParse({ fullName, phoneNumber: phoneNumber.trim() === '' ? null : phoneNumber });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const updated = await api<AuthUser>('/me', { method: 'PATCH', body: parsed.data });
      updateUser(updated);
      setFullName(updated.fullName);
      setPhoneNumber(updated.phoneNumber ?? '');
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
      setErrors(apiFieldErrors(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Profile" description="Your name and mobile number appear on orders and delivery paperwork." />
      <form onSubmit={submit} className="space-y-4 p-5" noValidate>
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">Email</p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="break-all text-ink-900">{user.email}</span>
            {user.emailVerified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Not verified</Badge>}
          </div>
        </div>

        <Field label="Full name" htmlFor="profile-fullName" error={errors.fullName}>
          <Input
            id="profile-fullName"
            autoComplete="name"
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              setSaved(false);
            }}
            aria-invalid={Boolean(errors.fullName)}
          />
        </Field>

        <Field label="Mobile number" htmlFor="profile-phoneNumber" error={errors.phoneNumber} hint="Optional — our driver calls this number before delivery">
          <Input
            id="profile-phoneNumber"
            type="tel"
            autoComplete="tel"
            placeholder="+971 50 123 4567"
            value={phoneNumber}
            onChange={(e) => {
              setPhoneNumber(e.target.value);
              setSaved(false);
            }}
            aria-invalid={Boolean(errors.phoneNumber)}
          />
        </Field>

        {error && <Alert tone="danger">{error}</Alert>}
        {saved && <Alert tone="success">Your profile has been updated.</Alert>}

        <div className="flex justify-end">
          <Button type="submit" loading={saving} disabled={!dirty}>
            Save changes
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function EmailVerificationNotice({ email }: { email: string }) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const resend = async () => {
    setStatus('sending');
    setError(null);
    try {
      await api<void>('/auth/email/verification', { method: 'POST' });
      setStatus('sent');
    } catch (err) {
      setError(errorMessage(err));
      setStatus('idle');
    }
  };

  return (
    <Alert tone="warning" title="Please confirm your email address">
      <p>
        We sent a verification link to <span className="font-medium">{email}</span>. Confirming it keeps your account secure and makes sure order
        updates reach you.
      </p>
      {status === 'sent' ? (
        <p className="mt-3 font-medium">A new link is on its way — check your inbox and spam folder.</p>
      ) : (
        <Button variant="secondary" size="sm" className="mt-3" loading={status === 'sending'} onClick={resend}>
          Resend verification email
        </Button>
      )}
      {error && (
        <p className="mt-2 text-red-700" role="alert">
          {error}
        </p>
      )}
    </Alert>
  );
}
