'use client';

import type { FormEvent, ReactNode } from 'react';
import { Alert, Button, Input, Spinner, cx } from '@/components/ui';
import { pluralize } from '@/lib/format';

/** Segmented filter control (toggle buttons) for switching a list between views. */
export function FilterTabs<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; count?: number }>;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex max-w-full flex-wrap gap-1 rounded-lg bg-slate-100 p-1 text-sm">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium whitespace-nowrap transition',
              active ? 'bg-white text-ink-900 shadow-sm' : 'text-slate-600 hover:bg-white/60 hover:text-ink-900',
            )}
          >
            {option.label}
            {option.count !== undefined && option.count > 0 && (
              <span className="rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-800">{option.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Search box that submits on Enter. It is uncontrolled and keyed by the applied value, so it
 * resets itself when the URL changes (back button, "clear filters").
 */
export function SearchForm({
  id,
  label,
  placeholder,
  value,
  onSearch,
  className,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onSearch: (value: string) => void;
  className?: string;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch(String(new FormData(event.currentTarget).get('q') ?? '').trim());
  };

  return (
    <form role="search" onSubmit={submit} className={cx('flex min-w-0 gap-2', className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="relative min-w-0 flex-1">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400">
          <circle cx="9" cy="9" r="5.5" />
          <path d="m13.5 13.5 3.5 3.5" strokeLinecap="round" />
        </svg>
        <Input key={value} id={id} name="q" type="search" defaultValue={value} placeholder={placeholder} className="pl-9" />
      </div>
      <Button type="submit" variant="secondary">
        Search
      </Button>
      {value && (
        <Button variant="ghost" onClick={() => onSearch('')}>
          Clear
        </Button>
      )}
    </form>
  );
}

/** Failed request with a retry action. */
export function LoadError({ title, error, onRetry }: { title: string; error: Error; onRetry: () => void }) {
  return (
    <Alert tone="danger" title={title}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>{error.message}</span>
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </Alert>
  );
}

/** "Showing 21–40 of 57 products", with a spinner while a refetch is in flight. */
export function ResultSummary({
  page,
  pageSize,
  total,
  singular,
  plural,
  loading,
  children,
}: {
  page: number;
  pageSize: number;
  total: number;
  singular: string;
  plural?: string;
  loading?: boolean;
  children?: ReactNode;
}) {
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <p className="flex items-center gap-2 text-sm text-slate-500" aria-live="polite">
        {total === 0 || from > total ? `No ${plural ?? `${singular}s`} to show` : `Showing ${from}–${to} of ${pluralize(total, singular, plural)}`}
        {loading && (
          <>
            <Spinner className="size-4 text-brand-600" />
            <span className="sr-only">Updating…</span>
          </>
        )}
      </p>
      {children}
    </div>
  );
}

/** Accessible on/off switch. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-emerald-500' : 'bg-slate-300',
      )}
    >
      <span aria-hidden="true" className={cx('inline-block size-5 rounded-full bg-white shadow transition', checked ? 'translate-x-5.5' : 'translate-x-0.5')} />
    </button>
  );
}

/** Labelled checkbox with an optional explanation underneath. */
export function CheckboxField({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex gap-3">
      <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 size-4 shrink-0 accent-brand-600" aria-describedby={description ? `${id}-description` : undefined} />
      <div className="text-sm">
        <label htmlFor={id} className="font-medium text-ink-900">
          {label}
        </label>
        {description && (
          <p id={`${id}-description`} className="text-slate-500">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
