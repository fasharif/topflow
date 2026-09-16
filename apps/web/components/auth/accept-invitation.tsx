'use client';

import { ORG_ROLE_LABELS, type InvitationPreviewDto } from '@topflow/shared';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, Button, Card, LinkButton, LoadingBlock } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { refreshSession, setActiveOrganization, signOut, useSession } from '@/lib/session';

/**
 * Team invitation landing page. Invitees sign in, or create their account with the invited email
 * address (confirming the mailbox with Supabase Auth), and then join the organization.
 */
export function AcceptInvitation() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const session = useSession();
  const [preview, setPreview] = useState<InvitationPreviewDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(token ? null : 'This invitation link is incomplete.');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    api<InvitationPreviewDto>('/invitations/preview', { method: 'POST', body: { token } })
      .then(setPreview)
      .catch((err: unknown) => setLoadError(errorMessage(err)));
  }, [token]);

  const accept = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const result = await api<{ organizationId: string }>('/invitations/accept', { method: 'POST', body: { token } });
      await refreshSession();
      setActiveOrganization(result.organizationId);
      router.replace('/business?joined=1');
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  };

  if (loadError) {
    return (
      <Alert tone="danger" title="Invitation unavailable">
        {loadError}
      </Alert>
    );
  }
  if (!preview || session.status === 'loading') return <LoadingBlock />;

  const here = `/invitations/accept?token=${encodeURIComponent(token)}`;
  const signedInAsOther = session.status === 'authenticated' && session.user?.email.toLowerCase() !== preview.email.toLowerCase();

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
          <p>
            You are signed in as {session.user?.email}. Sign out, then continue with {preview.email} to accept this invitation.
          </p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => void signOut()}>
            Sign out
          </Button>
        </Alert>
      ) : session.status === 'authenticated' ? (
        <Card className="p-5">
          <p className="text-sm text-slate-600">Accept to access {preview.organizationName}&apos;s quotations, orders and delivery sites.</p>
          {error && (
            <div className="mt-4">
              <Alert tone="danger">{error}</Alert>
            </div>
          )}
          <Button size="lg" className="mt-5 w-full" loading={submitting} onClick={() => void accept()}>
            Join organization
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          <LinkButton href={`/login?next=${encodeURIComponent(here)}`} size="lg" variant={preview.hasAccount ? 'primary' : 'secondary'} className="w-full">
            Sign in to accept
          </LinkButton>
          {!preview.hasAccount && (
            <LinkButton href={`/register?email=${encodeURIComponent(preview.email)}&next=${encodeURIComponent(here)}`} size="lg" className="w-full">
              Create your account
            </LinkButton>
          )}
          <p className="text-center text-sm text-slate-500">Use {preview.email}: the invitation only works for that address.</p>
        </div>
      )}
    </div>
  );
}
