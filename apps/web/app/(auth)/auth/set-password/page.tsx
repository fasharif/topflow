import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SetPasswordForm } from '@/components/auth/set-password-form';
import { DemoNotice } from '@/components/demo-notice';
import { DEMO_NOTICES, demoAllowsPasswordChoice, signInMethods } from '@/lib/demo';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Choose your password' };

/** Reached from a recovery or invitation email once /auth/confirm has started the session. */
export default async function SetPasswordPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect('/forgot-password?expired=1');

  // In the portfolio demo a shared account signed in with the published password never gets this form.
  if (!demoAllowsPasswordChoice(data.claims)) {
    return <DemoNotice title="Choose a new password">{DEMO_NOTICES.accountSecurity}</DemoNotice>;
  }

  const email = typeof data.claims.email === 'string' ? data.claims.email : '';
  return <SetPasswordForm email={email} invited={signInMethods(data.claims.amr).includes('invite')} />;
}
