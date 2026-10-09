import { Alert } from '@/components/ui';
import type { PriceCheck } from '@/lib/cart';

/** Said when the basket's prices could not be checked against the catalogue on this page. */
export function PriceCheckNotice({ check, className }: { check: PriceCheck; className?: string }) {
  if (check !== 'unverified') return null;
  return (
    <Alert tone="warning" className={className}>
      We could not check the current price of every item, so this total may be out of date. If it has changed, you will be asked to confirm the
      new total before the order is placed.
    </Alert>
  );
}
