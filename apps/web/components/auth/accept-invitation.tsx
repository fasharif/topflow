'use client';

import { ORG_ROLE_LABELS, passwordSchema, type AuthSession, type InvitationPreviewDto } from '@topflow/shared';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Card, Field, Input, LinkButton, LoadingBlock } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { applySession, refreshSession, setActiveOrganization, useSession } from '@/lib/session';

export function AcceptInvitation() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const session = useSession();
  const [preview, setPreview] = useState<InvitationPreviewDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(token ? null : 'This invitation link is incomplete.');
  const [form, setForm] = useState({ fullName: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    api<InvitationPreviewDto>('/invitations/preview', { method: 'POST', body: { token } })
      .then(setPreview)
      .catch((err: unknown) => setLoadError(errorMessage(err)));
  }, [token]);

  const accept = async (event?: FormEvent) => {
    event?.preventDefault();
    setError(null);
    if (session.status !== 'authenticated') {
      const check = passwordSchema.safeParse(form.password);
      if (form.fullName.trim().length < 2) return setError('Enter your full name');
      if (!check.success) return setError(check.error.issues[0]?.message ?? 'Choose a stronger password');
    }
    setSubmitting(true);
    try {
      const result = await api<{ organizationId: string; session: AuthSession | null }>('/invitations/accept', {
        method: 'POST',
        body: session.status === 'authenticated' ? { token } : { token, ...form },
      });
      if (result.session) applySession(result.session);
      else await refreshSession();
      setActiveOrganization(result.organizationId);
      router.replace('/business?joined=1');
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  };

  if (loadError) {
    return <Alert tone="danger" title="Invitation unavailable">{loadError}</Alert>;
  }
  if (!preview || session.status === 'loading') return <LoadingBlock />;

  const signedInAsOther = session.status === 'authenticated' && session.user?.email !== preview.email;
  const next = `/invitations/accept?token=${encodeURIComponent(token)}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">Join {preview.organizationName}</h1>
        <p className="mt-1 text-sm text-slate-500">
          You&apos;ve been invited as <strong>{ORG_ROLE_LABELS[preview.role]}</strong> using {preview.email}.
        </p>
      </div>

      {signedInAsOther ? (
        <Alert tone="warning" title="Different account">
          You are signed in as {session.user?.email}. Sign out and sign in as {preview.email} to accept this invitation.
        </Alert>
      ) : session.status === 'authenticated' ? (
        <Card className="p-5">
          <p className="text-sm text-slate-600">Accept to access {preview.organizationName}&apos;s quotations, orders and delivery sites.</p>
          {error && <div className="mt-4"><Alert tone="danger">{error}</Alert></div>}
          <Button size="lg" className="mt-5 w-full" loading={submitting} onClick={() => void accept()}>
            Join organization
          </Button>
        </Card>
      ) : preview.hasAccount ? (
        <LinkButton href={`/login?next=${encodeURIComponent(next)}`} size="lg" className="w-full">
          Sign in to accept
        </LinkButton>
      ) : (
        <form onSubmit={accept} className="space-y-4" noValidate>
          <Field label="Full name" htmlFor="fullName">
            <Input id="fullName" autoComplete="name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </Field>
          <Field label="Choose a password" htmlFor="password" hint="At least 8 characters, with letters and numbers">
            <Input id="password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" size="lg" className="w-full" loading={submitting}>
            Create account &amp; join
          </Button>
        </form>
      )}
    </div>
  );
}
