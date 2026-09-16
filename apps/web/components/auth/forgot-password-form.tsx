'use client';

import { forgotPasswordSchema } from '@topflow/shared';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Field, Input } from '@/components/ui';
import { requestPasswordReset } from '@/lib/auth/actions';

export function ForgotPasswordForm({ expired }: { expired: boolean }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a valid email address');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await requestPasswordReset(parsed.data);
      if (result.ok) setSent(true);
      else setError(result.error);
    } catch {
      setError('We could not send the email. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">Reset your password</h1>
      <p className="mt-1 text-sm text-slate-500">We&apos;ll email you a secure link to choose a new password.</p>
      {expired && !sent && (
        <div className="mt-6">
          <Alert tone="warning">Your password link has expired or was already used. Request a new one below.</Alert>
        </div>
      )}
      {sent ? (
        <div className="mt-8">
          <Alert tone="success" title="Check your inbox">
            If an account exists for {email}, a reset link is on its way. The link is valid for one hour.
          </Alert>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" size="lg" className="w-full" loading={submitting}>
            Send reset link
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
