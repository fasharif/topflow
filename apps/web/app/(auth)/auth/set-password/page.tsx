import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SetPasswordForm } from '@/components/auth/set-password-form';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Choose your password' };

/** Reached from a recovery or invitation email once /auth/confirm has started the session. */
export default async function SetPasswordPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect('/forgot-password?expired=1');

  const email = typeof data.claims.email === 'string' ? data.claims.email : '';
  const methods = Array.isArray(data.claims.amr)
    ? data.claims.amr.map((entry) => (typeof entry === 'string' ? entry : entry.method))
    : [];
  return <SetPasswordForm email={email} invited={methods.includes('invite')} />;
}
