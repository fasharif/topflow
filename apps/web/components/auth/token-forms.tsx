'use client';

import { PASSWORD_MIN_LENGTH, passwordSchema } from '@topflow/shared';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Alert, Button, Field, Input, LinkButton, LoadingBlock } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

export function ResetPasswordForm() {
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Choose a stronger password');
    if (password !== confirm) return setError('Passwords do not match');
    setSubmitting(true);
    setError(null);
    try {
      await api('/auth/password/reset', { method: 'POST', body: { token, password } });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return <Alert tone="danger" title="Invalid link">This reset link is incomplete. Request a new one from the sign-in page.</Alert>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">Choose a new password</h1>
      {done ? (
        <div className="mt-8 space-y-5">
          <Alert tone="success" title="Password updated">
            For your security you have been signed out of all devices.
          </Alert>
          <LinkButton href="/login" size="lg" className="w-full">
            Sign in
          </LinkButton>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
          <Field label="New password" htmlFor="password" hint={`At least ${PASSWORD_MIN_LENGTH} characters, with letters and numbers`}>
            <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Confirm new password" htmlFor="confirm">
            <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" size="lg" className="w-full" loading={submitting}>
            Update password
          </Button>
        </form>
      )}
    </div>
  );
}

export function VerifyEmail() {
  const token = useSearchParams().get('token') ?? '';
  const started = useRef(false);
  const [result, setResult] = useState<'pending' | 'verified' | string>(token ? 'pending' : 'This verification link is incomplete.');

  useEffect(() => {
    // Tokens are single-use: guard against React StrictMode running the effect twice.
    if (!token || started.current) return;
    started.current = true;
    api('/auth/email/verify', { method: 'POST', body: { token } })
      .then(() => setResult('verified'))
      .catch((err: unknown) => setResult(errorMessage(err)));
  }, [token]);

  if (result === 'pending') return <LoadingBlock label="Verifying your email…" />;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">Email verification</h1>
      {result === 'verified' ? (
        <Alert tone="success" title="Your email address is confirmed">
          Thank you — your account is fully set up.
        </Alert>
      ) : (
        <Alert tone="danger" title="We couldn't verify your email">
          {result}
        </Alert>
      )}
      <p className="text-sm">
        <Link href="/" className="font-medium text-brand-700 hover:underline">
          Continue to Top Flow
        </Link>
      </p>
    </div>
  );
}
