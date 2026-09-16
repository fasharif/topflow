'use client';

import { PASSWORD_MIN_LENGTH, newPasswordSchema } from '@topflow/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Field, Input } from '@/components/ui';
import { setNewPassword } from '@/lib/auth/actions';
import { landingPath } from '@/lib/auth/redirects';
import { zodFieldErrors, type FieldErrors } from '@/lib/forms';
import { refreshSession, sessionStore } from '@/lib/session';

/** Choosing a password after a recovery email or a staff invitation (the link started a session). */
export function SetPasswordForm({ email, invited }: { email: string; invited: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const parsed = newPasswordSchema.safeParse({ password, confirmPassword });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const result = await setNewPassword(parsed.data);
      if (!result.ok) {
        setError(result.error);
        setErrors(result.fieldErrors ?? {});
        setExpired(result.code === 'session_missing');
        setSubmitting(false);
        return;
      }
      await refreshSession();
      const user = sessionStore.getSnapshot().user;
      router.replace(user ? landingPath(user) : '/account');
    } catch {
      setError('We could not save your password. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">{invited ? 'Welcome to Top Flow Hub' : 'Choose a new password'}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {invited ? 'Choose the password you will use to sign in' : 'Set a new password'} for <span className="font-medium text-ink-900">{email}</span>.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
        {/* Lets password managers store the new password against the right account. */}
        <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
        <Field label="New password" htmlFor="password" error={errors.password} hint={`At least ${PASSWORD_MIN_LENGTH} characters, with letters and numbers`}>
          <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={Boolean(errors.password)} />
        </Field>
        <Field label="Confirm new password" htmlFor="confirmPassword" error={errors.confirmPassword}>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            aria-invalid={Boolean(errors.confirmPassword)}
          />
        </Field>
        {error && (
          <Alert tone="danger">
            <p>{error}</p>
            {expired && (
              <Link href="/forgot-password" className="mt-2 inline-block font-medium underline">
                Request a new link
              </Link>
            )}
          </Alert>
        )}
        {!invited && <p className="text-xs text-slate-500">For your security, every other device will be signed out.</p>}
        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          {invited ? 'Save password and continue' : 'Update password'}
        </Button>
      </form>
    </div>
  );
}
