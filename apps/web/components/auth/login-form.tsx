'use client';

import { loginSchema } from '@topflow/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Field, Input } from '@/components/ui';
import { resendConfirmation, signInWithPassword } from '@/lib/auth/actions';
import { landingPath, safeNextPath } from '@/lib/auth/redirects';
import { zodFieldErrors, type FieldErrors } from '@/lib/forms';
import { refreshSession, sessionStore } from '@/lib/session';

const DEMO_ACCOUNTS = [
  ['customer@example.com', 'Retail customer'],
  ['buyer@desertbloom.ae', 'Trade buyer (AED 5,000 limit)'],
  ['approver@desertbloom.ae', 'Trade approver'],
  ['sales@topflow.ae', 'Top Flow sales'],
  ['warehouse@topflow.ae', 'Top Flow warehouse'],
  ['admin@topflow.ae', 'Administrator'],
] as const;

const UNEXPECTED = 'We could not reach the sign-in service. Please try again.';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resent, setResent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const linkFailed = params.get('error') === 'link';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setUnconfirmed(false);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const result = await signInWithPassword(parsed.data);
      if (!result.ok) {
        setError(result.error);
        setUnconfirmed(result.code === 'email_not_confirmed');
        setSubmitting(false);
        return;
      }
      const next = safeNextPath(params.get('next'), window.location.origin, '');
      if (result.data.mfaRequired) {
        router.replace(next ? `/auth/mfa?next=${encodeURIComponent(next)}` : '/auth/mfa');
        return;
      }
      await refreshSession();
      const user = sessionStore.getSnapshot().user;
      router.replace(next || (user ? landingPath(user) : '/account'));
    } catch {
      setError(UNEXPECTED);
      setSubmitting(false);
    }
  };

  const resend = async () => {
    const result = await resendConfirmation({ email });
    if (result.ok) setResent(true);
    else setError(result.error);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">Welcome back</h1>
      <p className="mt-1 text-sm text-slate-500">Sign in to your Top Flow account.</p>

      {linkFailed && (
        <div className="mt-6">
          <Alert tone="warning" title="That link can't be used">
            It has expired or was already used. Sign in below, or request a new email from the page you came from.
          </Alert>
        </div>
      )}

      <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
        <Field label="Email" htmlFor="email" error={errors.email}>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(errors.email)} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password}>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={Boolean(errors.password)} />
        </Field>
        <div className="flex justify-end text-sm">
          <Link href="/forgot-password" className="font-medium text-brand-700 hover:underline">
            Forgot your password?
          </Link>
        </div>
        {error && (
          <Alert tone="danger">
            <p>{error}</p>
            {unconfirmed &&
              (resent ? (
                <p className="mt-2 font-medium">A new confirmation link is on its way.</p>
              ) : (
                <Button variant="secondary" size="sm" className="mt-3" onClick={resend}>
                  Resend confirmation email
                </Button>
              ))}
          </Alert>
        )}
        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          Sign in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        New to Top Flow?{' '}
        <Link href="/register" className="font-medium text-brand-700 hover:underline">
          Create an account
        </Link>
      </p>

      {process.env.NEXT_PUBLIC_DEMO_MODE === 'true' && (
        <details className="mt-8 rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <summary className="cursor-pointer font-medium text-ink-900">Demo accounts</summary>
          <p className="mt-2 text-xs text-slate-500">Password for all demo accounts: TopFlow2026!</p>
          <ul className="mt-3 space-y-1">
            {DEMO_ACCOUNTS.map(([demoEmail, label]) => (
              <li key={demoEmail}>
                <button
                  type="button"
                  className="text-left text-brand-700 hover:underline"
                  onClick={() => {
                    setEmail(demoEmail);
                    setPassword('TopFlow2026!');
                  }}
                >
                  {demoEmail}
                </button>{' '}
                <span className="text-slate-500">— {label}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
