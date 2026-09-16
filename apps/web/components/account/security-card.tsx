'use client';

import { PASSWORD_MIN_LENGTH, changePasswordSchema } from '@topflow/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Card, CardHeader, Field, Input, LinkButton } from '@/components/ui';
import { changePassword, getMfaStatus, removeTotp, type MfaStatus } from '@/lib/auth/actions';
import { zodFieldErrors, type FieldErrors } from '@/lib/forms';
import { refreshSession, signOut } from '@/lib/session';

const EMPTY_PASSWORDS = { currentPassword: '', newPassword: '', confirmPassword: '' };
type PasswordName = keyof typeof EMPTY_PASSWORDS;

function PasswordField({
  name,
  label,
  value,
  error,
  hint,
  autoComplete,
  onChange,
}: {
  name: PasswordName;
  label: string;
  value: string;
  error?: string;
  hint?: string;
  autoComplete: 'current-password' | 'new-password';
  onChange: (value: string) => void;
}) {
  const id = `security-${name}`;
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint}>
      <Input id={id} name={name} type="password" autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={Boolean(error)} />
    </Field>
  );
}

function ChangePasswordForm({ email }: { email: string }) {
  const [values, setValues] = useState(EMPTY_PASSWORDS);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const change = (name: PasswordName) => (value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
    setDone(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setDone(false);
    const parsed = changePasswordSchema.safeParse({ currentPassword: values.currentPassword, newPassword: values.newPassword });
    const nextErrors: FieldErrors = parsed.success ? {} : zodFieldErrors(parsed.error);
    if (values.confirmPassword !== values.newPassword) nextErrors.confirmPassword = 'Passwords do not match';
    setErrors(nextErrors);
    if (!parsed.success || nextErrors.confirmPassword) return;

    setSubmitting(true);
    try {
      const result = await changePassword(parsed.data);
      if (!result.ok) {
        setError(result.error);
        setErrors(result.fieldErrors ?? {});
        return;
      }
      setValues(EMPTY_PASSWORDS);
      setDone(true);
    } catch {
      setError('We could not change your password. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {/* Lets password managers associate the new password with this account. */}
      <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
      <PasswordField name="currentPassword" label="Current password" autoComplete="current-password" value={values.currentPassword} error={errors.currentPassword} onChange={change('currentPassword')} />
      <PasswordField
        name="newPassword"
        label="New password"
        autoComplete="new-password"
        hint={`At least ${PASSWORD_MIN_LENGTH} characters, with letters and numbers`}
        value={values.newPassword}
        error={errors.newPassword}
        onChange={change('newPassword')}
      />
      <PasswordField name="confirmPassword" label="Confirm new password" autoComplete="new-password" value={values.confirmPassword} error={errors.confirmPassword} onChange={change('confirmPassword')} />

      {error && <Alert tone="danger">{error}</Alert>}
      {done && (
        <Alert tone="success" title="Password changed">
          For your security, other devices were signed out. You are still signed in on this one.
        </Alert>
      )}

      <div className="flex justify-end">
        <Button type="submit" loading={submitting}>
          Update password
        </Button>
      </div>
    </form>
  );
}

function TwoFactorSection({ required }: { required: boolean }) {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    getMfaStatus()
      .then(setStatus)
      .catch(() => setError('We could not load your two-factor settings.'));
  }, []);

  const remove = async () => {
    if (!status?.factorId) return;
    setRemoving(true);
    setError(null);
    const result = await removeTotp({ factorId: status.factorId });
    if (!result.ok) {
      setError(result.error);
      setRemoving(false);
      return;
    }
    setStatus(await getMfaStatus());
    await refreshSession();
    setConfirming(false);
    setRemoving(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-ink-900">Two-factor authentication</h3>
        {status && (status.enabled ? <Badge tone="success">On</Badge> : <Badge tone="neutral">Off</Badge>)}
      </div>
      <p className="text-sm text-slate-500">
        Sign in with your password plus a 6-digit code from an authenticator app.
        {required && ' Required for back-office access.'}
      </p>
      {error && <Alert tone="danger">{error}</Alert>}
      {!status ? null : !status.enabled ? (
        <LinkButton href="/auth/mfa?next=/account">Set up an authenticator app</LinkButton>
      ) : status.assuranceLevel !== 'aal2' ? (
        <LinkButton variant="secondary" href="/auth/mfa?next=/account">
          Verify with your app to manage it
        </LinkButton>
      ) : confirming ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-danger-200 bg-danger-50 p-3">
          <p className="mr-auto text-sm text-danger-800">
            {required ? 'You will have to set it up again before using the back office.' : 'Your account will be protected by your password only.'}
          </p>
          <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={removing}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" loading={removing} onClick={remove}>
            Turn off
          </Button>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setConfirming(true)}>
          Turn off two-factor authentication
        </Button>
      )}
    </div>
  );
}

function SignOutEverywhere() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const signOutEverywhere = async () => {
    setSigningOut(true);
    await signOut('global');
    router.replace('/login');
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-ink-900">Signed-in devices</h3>
        <p className="mt-0.5 text-sm text-slate-500">Lost a phone or used a shared computer? Sign out everywhere, including this browser.</p>
      </div>
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-danger-200 bg-danger-50 p-3">
          <p className="mr-auto text-sm text-danger-800">You&apos;ll need to sign in again on every device.</p>
          <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={signingOut}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" loading={signingOut} onClick={signOutEverywhere}>
            Sign out everywhere
          </Button>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setConfirming(true)}>
          Sign out of all devices
        </Button>
      )}
    </div>
  );
}

export function SecurityCard({ email, mfaRequired = false }: { email: string; mfaRequired?: boolean }) {
  return (
    <Card>
      <CardHeader title="Password & security" description="Change your password, protect sign-in with an authenticator app, or end sessions on other devices." />
      <div className="p-5">
        <ChangePasswordForm email={email} />
      </div>
      <div className="border-t border-slate-100 p-5">
        <TwoFactorSection required={mfaRequired} />
      </div>
      <div className="border-t border-slate-100 p-5">
        <SignOutEverywhere />
      </div>
    </Card>
  );
}
