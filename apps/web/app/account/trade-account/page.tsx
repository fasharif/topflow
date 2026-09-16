import type { Metadata } from 'next';
import { TradeAccountForm } from '@/components/account/trade-account-form';
import { PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Open a trade account' };

export default function TradeAccountPage() {
  return (
    <div className="max-w-3xl">
      <PageHeader
        eyebrow="Trade account"
        title="Open a trade account"
        description="Project pricing, purchase approvals for your team and credit terms once Top Flow has verified your company."
      />
      <TradeAccountForm />
    </div>
  );
}
