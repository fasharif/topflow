'use client';

import type { ProductDto } from '@topflow/shared';
import { CircleAlert, Plus, Trash } from 'lucide-react';
import { useId, useRef } from 'react';
import { Button, IconButton, Input } from '@/components/ui';
import type { FieldErrors } from '@/lib/forms';

export interface SpecificationRow {
  /** Stable React key; not sent to the API. */
  key: string;
  name: string;
  value: string;
}

export function rowsFromSpecifications(specifications: ProductDto['specifications'] | undefined): SpecificationRow[] {
  return Object.entries(specifications ?? {}).map(([name, value], index) => ({ key: `spec-${index}`, name, value: String(value) }));
}

/**
 * Validates the rows and builds the `Record<string, string>` the API expects. Completely blank
 * rows are ignored; errors are keyed "specifications.<row index>.name|value".
 */
export function specificationsFromRows(rows: SpecificationRow[]): { specifications: Record<string, string>; errors: FieldErrors } {
  const specifications: Record<string, string> = {};
  const errors: FieldErrors = {};
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    const name = row.name.trim();
    const value = row.value.trim();
    if (!name && !value) return;

    const nameKey = `specifications.${index}.name`;
    if (!name) errors[nameKey] = 'Enter a name';
    else if (name.length > 60) errors[nameKey] = 'Use at most 60 characters';
    else if (seen.has(name.toLowerCase())) errors[nameKey] = 'This name is already used';

    const valueKey = `specifications.${index}.value`;
    if (!value) errors[valueKey] = 'Enter a value';
    else if (value.length > 500) errors[valueKey] = 'Use at most 500 characters';

    if (name) seen.add(name.toLowerCase());
    if (name && value) specifications[name] = value;
  });

  return { specifications, errors };
}

/** Same specifications, ignoring value types (the API may store numbers or booleans). */
export function sameSpecifications(a: ProductDto['specifications'], b: ProductDto['specifications']): boolean {
  const left = Object.entries(a ?? {});
  const right = Object.entries(b ?? {});
  return left.length === right.length && left.every(([name, value], index) => right[index]?.[0] === name && String(right[index]?.[1]) === String(value));
}

function RowError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-danger-700" role="alert">
      <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
      {message}
    </p>
  );
}

/** Editable list of name/value pairs (e.g. "Inlet size" → "3/4 in BSP"), shown as a table on the product page. */
export function SpecificationsEditor({ rows, onChange, errors }: { rows: SpecificationRow[]; onChange: (rows: SpecificationRow[]) => void; errors: FieldErrors }) {
  const baseId = useId();
  const created = useRef(0);

  const add = () => {
    created.current += 1;
    onChange([...rows, { key: `new-${created.current}`, name: '', value: '' }]);
  };
  const change = (key: string, patch: Partial<Omit<SpecificationRow, 'key'>>) => onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const remove = (key: string) => onChange(rows.filter((row) => row.key !== key));

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-600">
          No specifications yet. Add details buyers compare, such as flow rate, pressure range or connection size.
        </p>
      ) : (
        <>
          <div className="eyebrow hidden gap-2 text-slate-600 sm:grid sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_2.5rem]" aria-hidden="true">
            <span>Name</span>
            <span>Value</span>
          </div>
          {rows.map((row, index) => {
            const nameError = errors[`specifications.${index}.name`] ?? errors[`specifications.${row.name.trim()}`];
            const valueError = errors[`specifications.${index}.value`];
            const nameId = `${baseId}-name-${index}`;
            const valueId = `${baseId}-value-${index}`;
            return (
              <div key={row.key} className="grid gap-2 border-b border-slate-200 pb-3 last:border-0 last:pb-0 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_2.5rem] sm:items-start sm:border-0 sm:pb-0">
                <div>
                  <label htmlFor={nameId} className="sr-only">
                    Specification {index + 1} name
                  </label>
                  <Input
                    id={nameId}
                    value={row.name}
                    maxLength={60}
                    placeholder="e.g. Inlet size"
                    autoFocus={row.key.startsWith('new-')}
                    onChange={(e) => change(row.key, { name: e.target.value })}
                    aria-invalid={Boolean(nameError)}
                    aria-describedby={nameError ? `${nameId}-error` : undefined}
                  />
                  <RowError id={`${nameId}-error`} message={nameError} />
                </div>
                <div>
                  <label htmlFor={valueId} className="sr-only">
                    Specification {index + 1} value
                  </label>
                  <Input
                    id={valueId}
                    value={row.value}
                    maxLength={500}
                    placeholder="e.g. 3/4 in BSP"
                    onChange={(e) => change(row.key, { value: e.target.value })}
                    aria-invalid={Boolean(valueError)}
                    aria-describedby={valueError ? `${valueId}-error` : undefined}
                  />
                  <RowError id={`${valueId}-error`} message={valueError} />
                </div>
                <IconButton label={`Remove specification ${index + 1}`} onClick={() => remove(row.key)} className="justify-self-start">
                  <Trash aria-hidden="true" />
                </IconButton>
              </div>
            );
          })}
        </>
      )}
      <Button variant="secondary" size="sm" onClick={add}>
        <Plus aria-hidden="true" />
        Add specification
      </Button>
    </div>
  );
}
