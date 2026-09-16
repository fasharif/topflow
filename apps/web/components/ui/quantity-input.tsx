'use client';

import { Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import { cx } from './cx';

/**
 * Whole-number quantity with decrease/increase buttons. Typing updates the value as soon as it is
 * valid; an empty or out-of-range entry is corrected when the field loses focus. The +/- buttons
 * are left out of the tab order because the input already supports the arrow keys.
 */
export function QuantityInput({
  value,
  onChange,
  min = 1,
  max = 100_000,
  id,
  label,
  size = 'md',
  disabled = false,
  invalid = false,
  className,
  'aria-describedby': describedBy,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  id?: string;
  /** Accessible name of the input, e.g. "Quantity" or "Quantity of Barbed elbow". */
  label: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  'aria-describedby'?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (next: number) => Math.min(max, Math.max(min, Math.round(next)));

  const commit = (raw: string) => {
    setDraft(null);
    const parsed = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(parsed)) return;
    const next = clamp(parsed);
    if (next !== value) onChange(next);
  };

  const stepBy = (delta: number) => {
    setDraft(null);
    const next = clamp(value + delta);
    if (next !== value) onChange(next);
  };

  const lowerLabel = `${label.charAt(0).toLowerCase()}${label.slice(1)}`;
  const stepButton = cx(
    'grid shrink-0 cursor-pointer place-items-center text-slate-600 transition-colors hover:bg-slate-100 hover:text-ink-900 disabled:cursor-not-allowed disabled:opacity-40',
    size === 'sm' ? 'w-8' : 'w-10',
  );

  return (
    <div
      className={cx(
        'inline-flex items-stretch overflow-hidden rounded-lg border bg-white shadow-xs focus-within:border-flow-600 focus-within:outline-2 focus-within:-outline-offset-1 focus-within:outline-flow-600',
        invalid ? 'border-danger-600' : 'border-slate-400',
        size === 'sm' ? 'h-9' : 'h-10',
        className,
      )}
    >
      <button type="button" tabIndex={-1} className={stepButton} onClick={() => stepBy(-1)} disabled={disabled || value <= min} aria-label={`Decrease ${lowerLabel}`}>
        <Minus aria-hidden="true" className="size-4" />
      </button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={draft ?? String(value)}
        disabled={disabled}
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(event) => {
          const raw = event.target.value;
          setDraft(raw);
          const parsed = Number(raw);
          if (raw !== '' && Number.isInteger(parsed) && parsed >= min && parsed <= max && parsed !== value) onChange(parsed);
        }}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit(event.currentTarget.value);
          }
        }}
        className="no-spinner w-14 min-w-0 border-x border-slate-200 bg-transparent text-center text-sm font-medium tabular-nums text-ink-900 focus:outline-none disabled:text-slate-500"
      />
      <button type="button" tabIndex={-1} className={stepButton} onClick={() => stepBy(1)} disabled={disabled || value >= max} aria-label={`Increase ${lowerLabel}`}>
        <Plus aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
