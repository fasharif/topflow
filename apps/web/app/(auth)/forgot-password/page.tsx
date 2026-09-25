import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';
import { DemoNotice } from '@/components/demo-notice';
import { DEMO_MODE, DEMO_NOTICES } from '@/lib/demo';

export const metadata: Metadata = { title: 'Reset your password' };

export default async function ForgotPasswordPage({ searchParams }: PageProps<'/forgot-password'>) {
  if (DEMO_MODE) return <DemoNotice title="Reset your password">{DEMO_NOTICES.passwordReset}</DemoNotice>;
  const { expired } = await searchParams;
  return <ForgotPasswordForm expired={expired === '1'} />;
}
