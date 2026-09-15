import { UOM_LABELS, toFils, type OrderDto } from '@topflow/shared';
import { Card, CardHeader, Td, Th, cx } from '@/components/ui';
import { aed, pluralize } from '@/lib/format';

function TotalRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cx('flex justify-between gap-4', strong && 'border-t border-slate-200 pt-3 text-base')}>
      <dt className={strong ? 'font-semibold text-ink-900' : 'text-slate-600'}>{label}</dt>
      <dd className={cx('tabular-nums text-ink-900', strong ? 'font-bold' : 'font-medium')}>{value}</dd>
    </div>
  );
}

type ItemsOrder = Pick<OrderDto, 'items' | 'subtotal' | 'deliveryFee' | 'vatAmount' | 'vatRateBps' | 'totalAmount'>;

/** Line items with per-line VAT, followed by the document totals exactly as invoiced. */
export function OrderItemsCard({ order }: { order: ItemsOrder }) {
  const freeDelivery = toFils(order.deliveryFee) === 0;

  return (
    <Card>
      <CardHeader title="Items" description={pluralize(order.items.length, 'product')} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr>
              <Th>Product</Th>
              <Th className="text-right">Qty</Th>
              <Th className="text-right">Unit price</Th>
              <Th className="text-right">Subtotal</Th>
              <Th className="text-right">VAT</Th>
              <Th className="text-right">Total</Th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id}>
                <Td>
                  <p className="font-medium text-ink-900">{item.productName}</p>
                  <p className="font-mono text-xs text-slate-400">{item.sku}</p>
                </Td>
                <Td className="whitespace-nowrap text-right tabular-nums">
                  {item.quantity} {UOM_LABELS[item.uom]}
                </Td>
                <Td className="whitespace-nowrap text-right tabular-nums">{aed(item.unitPrice)}</Td>
                <Td className="whitespace-nowrap text-right tabular-nums">{aed(item.lineSubtotal)}</Td>
                <Td className="whitespace-nowrap text-right tabular-nums text-slate-600">{aed(item.vatAmount)}</Td>
                <Td className="whitespace-nowrap text-right font-semibold tabular-nums text-ink-900">{aed(item.lineTotal)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-slate-100 px-5 py-4">
        <dl className="ml-auto max-w-xs space-y-2 text-sm">
          <TotalRow label="Subtotal (excl. VAT)" value={aed(order.subtotal)} />
          <TotalRow label="Delivery" value={freeDelivery ? 'Free' : aed(order.deliveryFee)} />
          <TotalRow label={`VAT (${order.vatRateBps / 100}%)`} value={aed(order.vatAmount)} />
          <TotalRow label="Total" value={aed(order.totalAmount)} strong />
        </dl>
      </div>
    </Card>
  );
}
