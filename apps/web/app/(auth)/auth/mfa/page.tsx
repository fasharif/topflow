import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MfaVerification } from '@/components/auth/mfa-verification';
import { safeNextPath } from '@/lib/auth/redirects';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Two-factor authentication' };

export default async function MfaPage({ searchParams }: PageProps<'/auth/mfa'>) {
  const { next } = await searchParams;
  // Only paths on this site: the origin below is deliberately unmatchable.
  const destination = typeof next === 'string' ? safeNextPath(next, 'invalid://', '') : '';

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    const here = destination ? `/auth/mfa?next=${encodeURIComponent(destination)}` : '/auth/mfa';
    redirect(`/login?next=${encodeURIComponent(here)}`);
  }

  const [{ data: factors }, { data: assurance }] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  if (assurance?.currentLevel === 'aal2') redirect(destination || '/account');

  const hasApp = factors?.totp.some((factor) => factor.status === 'verified') ?? false;
  const email = typeof data.claims.email === 'string' ? data.claims.email : '';
  return <MfaVerification mode={hasApp ? 'challenge' : 'enroll'} next={destination} email={email} />;
}
