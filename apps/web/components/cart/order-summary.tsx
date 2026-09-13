import { calculateTotals, fromFils, retailDeliveryFeeFils, toFils } from '@topflow/shared';
import type { CartLine } from '@/lib/cart';
import { aed } from '@/lib/format';

/** Retail totals preview computed with the same shared maths the API uses for the invoice. */
export function retailTotals(lines: CartLine[]) {
  const netSubtotal = lines.reduce((sum, line) => sum + toFils(line.unitPrice) * line.quantity, 0);
  const totals = calculateTotals(
    lines.map((line) => ({ listPriceFils: toFils(line.unitPrice), quantity: line.quantity })),
    { deliveryFeeFils: retailDeliveryFeeFils(netSubtotal) },
  );
  return {
    lines: totals.lines,
    subtotal: fromFils(totals.subtotalFils),
    delivery: fromFils(totals.deliveryFeeFils),
    vat: fromFils(totals.vatFils),
    total: fromFils(totals.totalFils),
    freeDelivery: totals.deliveryFeeFils === 0,
  };
}

export function OrderSummary({ lines }: { lines: CartLine[] }) {
  const totals = retailTotals(lines);
  return (
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between">
        <dt className="text-slate-600">Subtotal (excl. VAT)</dt>
        <dd className="font-medium text-ink-900">{aed(totals.subtotal)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-slate-600">Delivery</dt>
        <dd className="font-medium text-ink-900">{totals.freeDelivery ? 'Free' : aed(totals.delivery)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-slate-600">VAT (5%)</dt>
        <dd className="font-medium text-ink-900">{aed(totals.vat)}</dd>
      </div>
      <div className="flex justify-between border-t border-slate-200 pt-3 text-base">
        <dt className="font-semibold text-ink-900">Total</dt>
        <dd className="font-bold text-ink-900">{aed(totals.total)}</dd>
      </div>
      {!totals.freeDelivery && <p className="text-xs text-slate-500">Free delivery on orders over AED 500 (excl. VAT).</p>}
    </dl>
  );
}
