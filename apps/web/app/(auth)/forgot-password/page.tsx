import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

export const metadata: Metadata = { title: 'Reset your password' };

export default async function ForgotPasswordPage({ searchParams }: PageProps<'/forgot-password'>) {
  const { expired } = await searchParams;
  return <ForgotPasswordForm expired={expired === '1'} />;
}
