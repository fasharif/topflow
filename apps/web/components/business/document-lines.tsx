import { UOM_LABELS, bpsToPercent, fromFils, toFils, type DocumentLineDto } from '@topflow/shared';
import { aed } from '@/lib/format';

/** "10.00" → "10%", "12.50" → "12.5%". */
export function formatPercent(value: string): string {
  const [whole, fraction = ''] = value.split('.');
  const trimmed = fraction.replace(/0+$/, '');
  return `${whole}${trimmed ? `.${trimmed}` : ''}%`;
}

function hasDiscount(line: DocumentLineDto): boolean {
  return toFils(line.discountRate) > 0;
}

/**
 * Priced lines of a quotation or order. A full table from `md`, stacked cards on phones.
 * List price and discount columns appear only when the document carries them.
 */
export function DocumentLines({ items }: { items: DocumentLineDto[] }) {
  const showListPrice = items.some((line) => line.listPrice !== null);
  const showDiscount = showListPrice || items.some(hasDiscount);

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th scope="col" className="px-4 py-2.5">Product</th>
              <th scope="col" className="px-4 py-2.5 text-right">Qty</th>
              {showListPrice && <th scope="col" className="px-4 py-2.5 text-right">List price</th>}
              {showDiscount && <th scope="col" className="px-4 py-2.5 text-right">Discount</th>}
              <th scope="col" className="px-4 py-2.5 text-right">Unit price</th>
              <th scope="col" className="px-4 py-2.5 text-right">Net</th>
              <th scope="col" className="px-4 py-2.5 text-right">VAT</th>
              <th scope="col" className="px-4 py-2.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((line) => (
              <tr key={line.id} className="align-top">
                <td className="px-4 py-3">
                  <p className="font-medium text-ink-900">{line.productName}</p>
                  <p className="font-mono text-xs text-slate-400">{line.sku}</p>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                  {line.quantity.toLocaleString('en-AE')} <span className="text-slate-500">{UOM_LABELS[line.uom]}</span>
                </td>
                {showListPrice && (
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-500">
                    {line.listPrice === null ? '—' : aed(line.listPrice)}
                  </td>
                )}
                {showDiscount && (
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                    {hasDiscount(line) ? <span className="text-emerald-700">{formatPercent(line.discountRate)}</span> : <span className="text-slate-400">—</span>}
                  </td>
                )}
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{aed(line.unitPrice)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{aed(line.lineSubtotal)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-500">{aed(line.vatAmount)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-ink-900">{aed(line.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-slate-100 md:hidden">
        {items.map((line) => (
          <li key={line.id} className="px-4 py-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-ink-900">{line.productName}</p>
                <p className="font-mono text-xs text-slate-400">{line.sku}</p>
              </div>
              <p className="whitespace-nowrap font-semibold tabular-nums text-ink-900">{aed(line.lineTotal)}</p>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {line.quantity.toLocaleString('en-AE')} {UOM_LABELS[line.uom]} × {aed(line.unitPrice)}
              {hasDiscount(line) && (
                <>
                  {' '}
                  <span className="text-emerald-700">
                    (−{formatPercent(line.discountRate)}
                    {line.listPrice !== null && ` off ${aed(line.listPrice)}`})
                  </span>
                </>
              )}
              {' · '}net {aed(line.lineSubtotal)} + VAT {aed(line.vatAmount)}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}

function TotalRow({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-600">{label}</dt>
      <dd className={valueClassName ?? 'font-medium tabular-nums text-ink-900'}>{value}</dd>
    </div>
  );
}

/** Document totals. Discounts are already netted into the subtotal, so they are shown against list value. */
export function DocumentTotals({
  subtotal,
  discountTotal,
  deliveryFee,
  vatAmount,
  vatRateBps,
  total,
}: {
  subtotal: string;
  discountTotal: string;
  deliveryFee: string;
  vatAmount: string;
  vatRateBps: number;
  total: string;
}) {
  const discountFils = toFils(discountTotal);
  return (
    <dl className="space-y-2 text-sm">
      {discountFils > 0 && (
        <>
          <TotalRow label="List value" value={aed(fromFils(toFils(subtotal) + discountFils))} />
          <TotalRow label="Trade discount" value={`− ${aed(discountTotal)}`} valueClassName="font-medium tabular-nums text-emerald-700" />
        </>
      )}
      <TotalRow label="Subtotal (excl. VAT)" value={aed(subtotal)} />
      <TotalRow label="Delivery" value={toFils(deliveryFee) === 0 ? 'No charge' : aed(deliveryFee)} />
      <TotalRow label={`VAT (${formatPercent(bpsToPercent(vatRateBps))})`} value={aed(vatAmount)} />
      <div className="flex justify-between gap-4 border-t border-slate-200 pt-3 text-base">
        <dt className="font-semibold text-ink-900">Total (incl. VAT)</dt>
        <dd className="font-bold tabular-nums text-ink-900">{aed(total)}</dd>
      </div>
    </dl>
  );
}
