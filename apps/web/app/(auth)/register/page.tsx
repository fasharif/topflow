import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { RegisterForm } from '@/components/auth/register-form';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Create an account' };

export default async function RegisterPage({ searchParams }: PageProps<'/register'>) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) {
    // Already signed in: a business sign-up becomes an application for a trade account.
    const { type } = await searchParams;
    redirect(type === 'business' ? '/account/trade-account' : '/account');
  }

  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}
