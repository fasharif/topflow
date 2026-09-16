'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Alert, Button, Field, Input, LoadingBlock } from '@/components/ui';
import { startTotpEnrollment, verifyTotp } from '@/lib/auth/actions';
import { landingPath } from '@/lib/auth/redirects';
import { refreshSession, sessionStore, signOut } from '@/lib/session';

interface Enrollment {
  factorId: string;
  qrCode: string;
  secret: string;
}

/** Supabase returns the QR code as SVG; accept both a data URL and raw markup. */
function qrSource(qrCode: string): string {
  return qrCode.startsWith('data:') ? qrCode : `data:image/svg+xml;utf8,${encodeURIComponent(qrCode)}`;
}

/**
 * Second sign-in step with an authenticator app (TOTP). "challenge" verifies a code for an account
 * that already has an app; "enroll" links a new app first. Success upgrades the session to aal2.
 */
export function MfaVerification({ mode, next, email }: { mode: 'challenge' | 'enroll'; next: string; email: string }) {
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    // Enrolment creates a factor: guard against React StrictMode running the effect twice.
    if (mode !== 'enroll' || started.current) return;
    started.current = true;
    startTotpEnrollment()
      .then((result) => (result.ok ? setEnrollment(result.data) : setError(result.error)))
      .catch(() => setError('We could not start the set-up. Please reload the page.'));
  }, [mode]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await verifyTotp({ code, factorId: enrollment?.factorId });
      if (!result.ok) {
        setError(result.fieldErrors?.code ?? result.error);
        setSubmitting(false);
        return;
      }
      await refreshSession();
      const user = sessionStore.getSnapshot().user;
      router.replace(next || (user ? landingPath(user) : '/account'));
    } catch {
      setError('We could not verify the code. Please try again.');
      setSubmitting(false);
    }
  };

  const leave = async () => {
    await signOut();
    router.replace('/login');
  };

  const codeForm = (
    <form onSubmit={submit} className="mt-6 space-y-5" noValidate>
      <Field label="6-digit code" htmlFor="mfa-code" hint="From your authenticator app. Codes change every 30 seconds.">
        <Input
          id="mfa-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className="font-mono text-lg tracking-widest"
          autoFocus
        />
      </Field>
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" size="lg" className="w-full" loading={submitting} disabled={code.length !== 6}>
        Verify and continue
      </Button>
    </form>
  );

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">
        {mode === 'challenge' ? 'Enter your verification code' : 'Set up two-factor authentication'}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        {mode === 'challenge'
          ? 'Your account is protected with an authenticator app.'
          : 'Back-office access needs a second step when you sign in. It takes about a minute.'}
      </p>

      {mode === 'enroll' && !enrollment && !error && <LoadingBlock label="Preparing your set-up…" />}

      {mode === 'enroll' && enrollment && (
        <ol className="mt-6 space-y-5 text-sm text-slate-700">
          <li>
            <p className="font-medium text-ink-900">1. Install an authenticator app</p>
            <p className="mt-1 text-slate-500">For example Microsoft Authenticator, Google Authenticator or 1Password.</p>
          </li>
          <li>
            <p className="font-medium text-ink-900">2. Scan this QR code with the app</p>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- inline SVG data from Supabase */}
              <img src={qrSource(enrollment.qrCode)} alt="QR code for your authenticator app" width={176} height={176} className="rounded-lg border border-slate-200 bg-white p-2" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-500">Can&apos;t scan it? Enter this key instead:</p>
                <code className="mt-1 block break-all rounded-md bg-slate-100 px-2 py-1.5 font-mono text-xs text-ink-900">{enrollment.secret}</code>
              </div>
            </div>
          </li>
          <li>
            <p className="font-medium text-ink-900">3. Enter the code the app shows</p>
          </li>
        </ol>
      )}

      {(mode === 'challenge' || enrollment) && codeForm}
      {mode === 'enroll' && !enrollment && error && (
        <div className="mt-6">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      <p className="mt-8 text-center text-sm text-slate-500">
        Signed in as {email}.{' '}
        <button type="button" onClick={leave} className="font-medium text-brand-700 hover:underline">
          Sign out
        </button>
      </p>
    </div>
  );
}
