'use client';

import {
  QUOTATION_MAX_VALIDITY_DAYS,
  UOM_LABELS,
  VAT_RATE_BPS,
  calculateLine,
  calculateTotals,
  fromFils,
  percentToBps,
  toFils,
  type DocumentLineDto,
  type DocumentTotals as TotalsInFils,
  type LineAmounts,
  type ProductDto,
  type UnitOfMeasure,
} from '@topflow/shared';
import { Badge, Button, Card, CardHeader, Field, Input, Td, Textarea, Th } from '@/components/ui';
import type { FieldErrors } from '@/lib/forms';
import { aed } from '@/lib/format';
import { formatPercent } from './detail';
import { DocumentTotals } from './document-lines';
import { ProductPicker } from './product-picker';

// ─── Form model ────────────────────────────────────────────────────────────

export interface EditorLine {
  productId: string;
  sku: string;
  productName: string;
  uom: UnitOfMeasure;
  /** Raw input text; parsed for the preview and validated with the shared schema on submit. */
  quantity: string;
  /** Percent; blank = the organization's default discount (applied by the server). */
  discount: string;
  /** Net AED; blank = the catalog price. */
  listPrice: string;
  /** Price the preview uses when no override is entered (catalog price, or the saved list price). */
  basePrice: string | null;
  /** Discount the line currently has on the server (existing draft lines only). */
  savedDiscount: string | null;
  minOrderQty: number | null;
  isTradeOnly: boolean;
  /** Customer note carried over from the RFQ line. */
  note: string | null;
}

export interface QuotationFormValues {
  lines: EditorLine[];
  deliveryFee: string;
  validityDays: string;
  notes: string;
  terms: string;
  internalNotes: string;
}

/** "10.00" → "10", "12.50" → "12.5". */
function trimDecimal(value: string): string {
  return value.includes('.') ? value.replace(/\.?0+$/, '') : value;
}

export function lineFromProduct(product: ProductDto, options: { quantity?: number; note?: string | null } = {}): EditorLine {
  return {
    productId: product.id,
    sku: product.sku,
    productName: product.name,
    uom: product.uom,
    quantity: String(Math.max(1, options.quantity ?? product.minOrderQty)),
    discount: '',
    listPrice: '',
    basePrice: product.unitPrice,
    savedDiscount: null,
    minOrderQty: product.minOrderQty,
    isTradeOnly: product.isTradeOnly,
    note: options.note ?? null,
  };
}

/**
 * Existing draft line. Its saved discount and list price are pre-filled so saving never silently
 * drops an override; clearing a field reverts that line to the organization default / catalog price.
 */
export function lineFromDocument(line: DocumentLineDto & { productId: string }): EditorLine {
  return {
    productId: line.productId,
    sku: line.sku,
    productName: line.productName,
    uom: line.uom,
    quantity: String(line.quantity),
    discount: trimDecimal(line.discountRate),
    listPrice: line.listPrice ?? '',
    basePrice: line.listPrice,
    savedDiscount: line.discountRate,
    minOrderQty: null,
    isTradeOnly: false,
    note: null,
  };
}

/** Request body lines (validate with the shared quotation schema before sending). */
export function linesPayload(lines: EditorLine[]) {
  return lines.map((line) => ({
    productId: line.productId,
    quantity: Number(line.quantity.trim()),
    ...(line.discount.trim() !== '' && { discountRate: Number(line.discount.trim()) }),
    ...(line.listPrice.trim() !== '' && { listPrice: line.listPrice.trim() }),
  }));
}

// ─── Preview maths (shared money helpers — the same code the API uses) ─────

const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;
const PERCENT_PATTERN = /^\d{1,3}(\.\d{1,2})?$/;

type PreviewIssue = 'empty' | 'invalid' | 'unpriced';

function previewLine(line: EditorLine, defaultDiscount: string | null): { amounts: LineAmounts | null; issue: PreviewIssue | null } {
  const quantityText = line.quantity.trim();
  const quantity = /^\d+$/.test(quantityText) ? Number(quantityText) : 0;
  const listPrice = line.listPrice.trim();
  const discount = line.discount.trim();
  const invalid =
    quantity < 1 || quantity > 100_000 || (listPrice !== '' && !MONEY_PATTERN.test(listPrice)) || (discount !== '' && (!PERCENT_PATTERN.test(discount) || Number(discount) > 100));
  if (invalid) return { amounts: null, issue: 'invalid' };

  const price = listPrice || line.basePrice;
  if (!price) return { amounts: null, issue: 'unpriced' };
  const effectiveDiscount = discount || defaultDiscount || line.savedDiscount || '0';
  return { amounts: calculateLine({ listPriceFils: toFils(price), quantity, discountBps: percentToBps(effectiveDiscount) }), issue: null };
}

export function previewTotals(values: QuotationFormValues, defaultDiscount: string | null): { lines: Array<LineAmounts | null>; totals: TotalsInFils | null; issue: PreviewIssue | null } {
  const previews = values.lines.map((line) => previewLine(line, defaultDiscount));
  const lines = previews.map((preview) => preview.amounts);
  const fee = values.deliveryFee.trim() || '0';
  if (previews.length === 0) return { lines, totals: null, issue: 'empty' };
  if (!MONEY_PATTERN.test(fee) || previews.some((preview) => preview.issue === 'invalid')) return { lines, totals: null, issue: 'invalid' };
  const priced = lines.filter((amounts): amounts is LineAmounts => amounts !== null);
  if (priced.length !== lines.length) return { lines, totals: null, issue: 'unpriced' };
  return { lines, totals: calculateTotals(priced, { deliveryFeeFils: toFils(fee) }), issue: null };
}

// ─── Sections ──────────────────────────────────────────────────────────────

interface SectionProps {
  values: QuotationFormValues;
  onChange: (values: QuotationFormValues) => void;
  errors: FieldErrors;
  disabled?: boolean;
}

function CellError({ message }: { message?: string }) {
  return message ? (
    <p className="mt-1 text-xs text-red-600" role="alert">
      {message}
    </p>
  ) : null;
}

export function QuotationLinesCard({ values, onChange, errors, disabled, defaultDiscount }: SectionProps & { defaultDiscount: string | null }) {
  const { lines: amounts } = previewTotals(values, defaultDiscount);
  const setLine = (index: number, patch: Partial<EditorLine>) =>
    onChange({ ...values, lines: values.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)) });
  const removeLine = (index: number) => onChange({ ...values, lines: values.lines.filter((_, i) => i !== index) });
  const addProduct = (product: ProductDto) => onChange({ ...values, lines: [...values.lines, lineFromProduct(product)] });
  const defaultLabel = defaultDiscount ? `Default ${formatPercent(defaultDiscount)}` : 'Org. default';

  return (
    <Card>
      <CardHeader
        title="Line items"
        description="Blank discount = the organization’s default trade discount. Blank list price = catalog price. Prices are net of VAT."
      />
      <div className="border-b border-slate-100 p-5">
        <ProductPicker selectedIds={values.lines.map((line) => line.productId)} onSelect={addProduct} disabled={disabled} />
      </div>

      {values.lines.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="font-medium text-ink-900">No lines yet</p>
          <p className="mt-1 text-sm text-slate-500">Search the catalog above to add products.</p>
          <CellError message={errors.items} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr>
                <Th>Product</Th>
                <Th>Qty</Th>
                <Th>List price</Th>
                <Th>Discount %</Th>
                <Th className="text-right">Unit net</Th>
                <Th className="text-right">Line net</Th>
                <Th>
                  <span className="sr-only">Remove</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {values.lines.map((line, index) => {
                const lineAmounts = amounts[index] ?? null;
                const quantityError = errors[`items.${index}.quantity`];
                const priceError = errors[`items.${index}.listPrice`];
                const discountError = errors[`items.${index}.discountRate`];
                const belowMinimum = line.minOrderQty !== null && Number(line.quantity) > 0 && Number(line.quantity) < line.minOrderQty;
                return (
                  <tr key={line.productId}>
                    <Td className="align-top">
                      <p className="font-medium text-ink-900">{line.productName}</p>
                      <p className="font-mono text-xs text-slate-400">{line.sku}</p>
                      {line.isTradeOnly && (
                        <Badge tone="brand" className="mt-1">
                          Trade only
                        </Badge>
                      )}
                      {line.note && <p className="mt-1 max-w-xs text-xs text-slate-500">Customer note: {line.note}</p>}
                      <CellError message={errors[`items.${index}.productId`]} />
                    </Td>
                    <Td className="align-top">
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          step={1}
                          value={line.quantity}
                          onChange={(event) => setLine(index, { quantity: event.target.value })}
                          className="w-20 text-right"
                          aria-label={`Quantity of ${line.sku}`}
                          aria-invalid={Boolean(quantityError)}
                          disabled={disabled}
                        />
                        <span className="text-xs text-slate-400">{UOM_LABELS[line.uom]}</span>
                      </div>
                      {belowMinimum && <p className="mt-1 text-xs text-amber-700">Min. order {line.minOrderQty}</p>}
                      <CellError message={quantityError} />
                    </Td>
                    <Td className="align-top">
                      <Input
                        inputMode="decimal"
                        value={line.listPrice}
                        placeholder={line.basePrice ?? 'Catalog'}
                        onChange={(event) => setLine(index, { listPrice: event.target.value })}
                        className="w-28 text-right"
                        aria-label={`List price of ${line.sku}`}
                        aria-invalid={Boolean(priceError)}
                        disabled={disabled}
                      />
                      {line.listPrice.trim() === '' && <p className="mt-1 text-xs text-slate-400">Catalog price</p>}
                      <CellError message={priceError} />
                    </Td>
                    <Td className="align-top">
                      <Input
                        inputMode="decimal"
                        value={line.discount}
                        placeholder={defaultDiscount ? trimDecimal(defaultDiscount) : 'Default'}
                        onChange={(event) => setLine(index, { discount: event.target.value })}
                        className="w-20 text-right"
                        aria-label={`Discount on ${line.sku} (percent)`}
                        aria-invalid={Boolean(discountError)}
                        disabled={disabled}
                      />
                      {line.discount.trim() === '' && <p className="mt-1 text-xs text-slate-400">{defaultLabel}</p>}
                      <CellError message={discountError} />
                    </Td>
                    <Td className="whitespace-nowrap text-right align-top tabular-nums text-slate-700">
                      <span className="inline-block pt-2.5">{lineAmounts ? aed(fromFils(lineAmounts.unitPriceFils)) : '—'}</span>
                    </Td>
                    <Td className="whitespace-nowrap text-right align-top font-medium tabular-nums text-ink-900">
                      <span className="inline-block pt-2.5">{lineAmounts ? aed(fromFils(lineAmounts.lineSubtotalFils)) : '—'}</span>
                    </Td>
                    <Td className="text-right align-top">
                      <Button variant="ghost" size="sm" className="mt-1" onClick={() => removeLine(index)} disabled={disabled} aria-label={`Remove ${line.sku}`}>
                        Remove
                      </Button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function QuotationSettingsFields({ values, onChange, errors, disabled }: SectionProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
      <Field label="Delivery fee (AED, excl. VAT)" htmlFor="deliveryFee" error={errors.deliveryFee} hint="Leave empty for no delivery charge.">
        <Input
          id="deliveryFee"
          inputMode="decimal"
          value={values.deliveryFee}
          placeholder="0.00"
          onChange={(event) => onChange({ ...values, deliveryFee: event.target.value })}
          aria-invalid={Boolean(errors.deliveryFee)}
          disabled={disabled}
        />
      </Field>
      <Field label="Valid for (days)" htmlFor="validityDays" error={errors.validityDays} hint={`1–${QUOTATION_MAX_VALIDITY_DAYS} days, counted from when it is sent.`}>
        <Input
          id="validityDays"
          type="number"
          inputMode="numeric"
          min={1}
          max={QUOTATION_MAX_VALIDITY_DAYS}
          step={1}
          value={values.validityDays}
          onChange={(event) => onChange({ ...values, validityDays: event.target.value })}
          aria-invalid={Boolean(errors.validityDays)}
          disabled={disabled}
        />
      </Field>
    </div>
  );
}

export function QuotationTermsCard({ values, onChange, errors, disabled }: SectionProps) {
  return (
    <Card>
      <CardHeader title="Notes & terms" />
      <div className="space-y-4 p-5">
        <Field label="Notes for the customer" htmlFor="notes" error={errors.notes} hint="Shown to the customer and printed on the PDF.">
          <Textarea id="notes" value={values.notes} maxLength={2000} onChange={(event) => onChange({ ...values, notes: event.target.value })} disabled={disabled} />
        </Field>
        <Field label="Terms & conditions" htmlFor="terms" error={errors.terms} hint="Payment, delivery and validity terms.">
          <Textarea id="terms" rows={4} value={values.terms} maxLength={4000} onChange={(event) => onChange({ ...values, terms: event.target.value })} disabled={disabled} />
        </Field>
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
          <Field label="Internal notes" htmlFor="internalNotes" error={errors.internalNotes} hint="Top Flow staff only — never shown to the customer.">
            <Textarea
              id="internalNotes"
              value={values.internalNotes}
              maxLength={2000}
              onChange={(event) => onChange({ ...values, internalNotes: event.target.value })}
              disabled={disabled}
            />
          </Field>
        </div>
      </div>
    </Card>
  );
}

const ISSUE_MESSAGES: Record<PreviewIssue, string> = {
  empty: 'Add at least one line to see totals.',
  invalid: 'Fix the highlighted quantities, prices or discounts to see totals.',
  unpriced: 'Some lines have no known catalog price yet — enter a list price or save to let the server price them.',
};

export function QuotationTotalsPreview({ values, defaultDiscount }: { values: QuotationFormValues; defaultDiscount: string | null }) {
  const { totals, issue } = previewTotals(values, defaultDiscount);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink-900">Totals</p>
        <Badge>Preview</Badge>
      </div>
      {totals ? (
        <DocumentTotals
          subtotal={fromFils(totals.subtotalFils)}
          discountTotal={fromFils(totals.discountTotalFils)}
          deliveryFee={fromFils(totals.deliveryFeeFils)}
          vatAmount={fromFils(totals.vatFils)}
          total={fromFils(totals.totalFils)}
          vatRateBps={VAT_RATE_BPS}
        />
      ) : (
        <p className="text-sm text-slate-500">{issue ? ISSUE_MESSAGES[issue] : null}</p>
      )}
      <p className="mt-3 text-xs text-slate-500">Preview — the server recalculates on save.</p>
    </div>
  );
}
