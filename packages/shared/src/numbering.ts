import type { DocumentType } from './constants';

/** Key of the DocumentSequence row holding the counter for a document type and year. */
export function sequenceKey(type: DocumentType, year: number): string {
  return `${type}-${year}`;
}

/** TF-SO-2026-000123 — sequential numbering as expected on UAE commercial documents. */
export function formatDocumentNumber(type: DocumentType, year: number, value: number): string {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`Sequence value must be a positive integer (got ${value})`);
  }
  return `${type}-${year}-${String(value).padStart(6, '0')}`;
}

/** "TF-QT-2026-000045" for the first issue, "TF-QT-2026-000045 Rev.2" afterwards. */
export function quotationDisplayNumber(number: string, revision: number): string {
  return revision > 1 ? `${number} Rev.${revision}` : number;
}
