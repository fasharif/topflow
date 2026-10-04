'use client';

import { DEMO_ACCOUNTS, DEMO_ACCOUNT_PASSWORD, loginSchema } from '@topflow/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Field, Input } from '@/components/ui';
import { resendConfirmation, signInWithPassword } from '@/lib/auth/actions';
import { landingPath, safeNextPath } from '@/lib/auth/redirects';
import { DEMO_MODE } from '@/lib/demo';
import { zodFieldErrors, type FieldErrors } from '@/lib/forms';
import { refreshSession, sessionStore, useSession } from '@/lib/session';

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
  // Why the API refused a signed-in identity (a disabled account, an email conflict), from this form
  // or from the page that sent the visitor here.
  const { accountProblem } = useSession();
  const problem = error ?? accountProblem;

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
      const { user, accountProblem: refused } = sessionStore.getSnapshot();
      if (!user && refused) {
        // The session has been ended again: stay on this form, which shows the reason.
        setSubmitting(false);
        return;
      }
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
        {problem && (
          <Alert tone="danger">
            <p>{problem}</p>
            {error &&
              unconfirmed &&
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

      {!DEMO_MODE && (
        <p className="mt-6 text-center text-sm text-slate-600">
          New to Top Flow?{' '}
          <Link href="/register" className="font-medium text-brand-700 hover:underline">
            Create an account
          </Link>
        </p>
      )}

      {DEMO_MODE && (
        <details open className="mt-8 rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <summary className="cursor-pointer font-medium text-ink-900">Demo accounts</summary>
          <p className="mt-2 text-xs text-slate-500">
            Choose an account to fill in the form. They all use the password {DEMO_ACCOUNT_PASSWORD}, and the data resets every night.
          </p>
          <ul className="mt-3 space-y-1.5">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  className="text-left font-medium text-brand-700 hover:underline"
                  onClick={() => {
                    setEmail(account.email);
                    setPassword(DEMO_ACCOUNT_PASSWORD);
                  }}
                >
                  {account.email}
                </button>
                <span className="block text-xs text-slate-500">
                  {account.label} · {account.tryThis}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
