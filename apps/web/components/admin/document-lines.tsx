import { UOM_LABELS, bpsToPercent, type DocumentLineDto } from '@topflow/shared';
import { Table, Td, Th } from '@/components/ui';
import { aed } from '@/lib/format';
import { formatPercent } from './detail';

/** Read-only priced lines of a quotation or order. */
export function DocumentLinesTable({ lines, showListPrice = false }: { lines: DocumentLineDto[]; showListPrice?: boolean }) {
  const hasDiscount = lines.some((line) => line.discountRate !== '0.00');
  return (
    <Table>
      <thead>
        <tr>
          <Th>Product</Th>
          <Th className="text-right">Qty</Th>
          {showListPrice && <Th className="text-right">List price</Th>}
          {hasDiscount && <Th className="text-right">Discount</Th>}
          <Th className="text-right">Unit price</Th>
          <Th className="text-right">Net</Th>
          <Th className="text-right">VAT</Th>
          <Th className="text-right">Total</Th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line) => (
          <tr key={line.id}>
            <Td>
              <p className="font-medium text-ink-900">{line.productName}</p>
              <p className="font-mono text-xs text-slate-500">{line.sku}</p>
            </Td>
            <Td className="whitespace-nowrap text-right tabular-nums">
              {line.quantity} <span className="text-slate-500">{UOM_LABELS[line.uom]}</span>
            </Td>
            {showListPrice && <Td className="whitespace-nowrap text-right tabular-nums text-slate-600">{line.listPrice ? aed(line.listPrice) : '—'}</Td>}
            {hasDiscount && (
              <Td className="whitespace-nowrap text-right tabular-nums text-slate-600">{line.discountRate === '0.00' ? '—' : formatPercent(line.discountRate)}</Td>
            )}
            <Td className="whitespace-nowrap text-right tabular-nums">{aed(line.unitPrice)}</Td>
            <Td className="whitespace-nowrap text-right tabular-nums">{aed(line.lineSubtotal)}</Td>
            <Td className="whitespace-nowrap text-right tabular-nums text-slate-600">{aed(line.vatAmount)}</Td>
            <Td className="whitespace-nowrap text-right font-medium tabular-nums text-ink-900">{aed(line.lineTotal)}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-600">{label}</dt>
      <dd className="font-medium tabular-nums text-ink-900">{value}</dd>
    </div>
  );
}

/** Document totals. `subtotal` is already net of line discounts (as returned by the API). */
export function DocumentTotals({
  subtotal,
  discountTotal,
  deliveryFee,
  vatAmount,
  total,
  vatRateBps,
}: {
  subtotal: string;
  discountTotal: string;
  deliveryFee: string;
  vatAmount: string;
  total: string;
  vatRateBps: number;
}) {
  return (
    <dl className="space-y-2 text-sm">
      {/* The discount note is a second <dd> of the subtotal group, so the list only contains valid dt/dd groups. */}
      <div className="flex flex-wrap justify-between gap-x-4">
        <dt className="text-slate-600">Subtotal (excl. VAT)</dt>
        <dd className="font-medium tabular-nums text-ink-900">{aed(subtotal)}</dd>
        {discountTotal !== '0.00' && <dd className="mt-1 w-full text-xs text-success-700">Includes {aed(discountTotal)} of line discounts</dd>}
      </div>
      <TotalRow label="Delivery" value={aed(deliveryFee)} />
      <TotalRow label={`VAT (${formatPercent(bpsToPercent(vatRateBps))})`} value={aed(vatAmount)} />
      <div className="flex justify-between gap-4 border-t border-slate-200 pt-3 text-base">
        <dt className="font-semibold text-ink-900">Total</dt>
        <dd className="font-semibold tabular-nums text-ink-900">{aed(total)}</dd>
      </div>
    </dl>
  );
}
