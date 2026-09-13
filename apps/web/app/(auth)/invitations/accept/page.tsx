import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AcceptInvitation } from '@/components/auth/accept-invitation';

export const metadata: Metadata = { title: 'Join your team' };

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={null}>
      <AcceptInvitation />
    </Suspense>
  );
}
