'use client';

import { isStaffRole, loginSchema, type AuthSession } from '@topflow/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { zodFieldErrors, type FieldErrors } from '@/lib/forms';
import { applySession } from '@/lib/session';

const DEMO_ACCOUNTS = [
  ['customer@example.com', 'Retail customer'],
  ['buyer@desertbloom.ae', 'Trade buyer (AED 5,000 limit)'],
  ['approver@desertbloom.ae', 'Trade approver'],
  ['sales@topflow.ae', 'Top Flow sales'],
  ['warehouse@topflow.ae', 'Top Flow warehouse'],
  ['admin@topflow.ae', 'Administrator'],
] as const;

/** Only follow same-site relative redirects (prevents open-redirect phishing links). */
function safeNext(next: string | null): string | null {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const session = await api<AuthSession>('/auth/login', { method: 'POST', body: parsed.data });
      applySession(session);
      const fallback = isStaffRole(session.user.role) ? '/admin' : session.user.memberships.length > 0 ? '/business' : '/account';
      router.replace(safeNext(params.get('next')) ?? fallback);
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">Welcome back</h1>
      <p className="mt-1 text-sm text-slate-500">Sign in to your Top Flow account.</p>

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
        {error && <Alert tone="danger">{error}</Alert>}
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
