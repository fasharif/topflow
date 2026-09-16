'use client';

import type { FormEvent, ReactNode } from 'react';
import { Alert, Button, SearchInput, Spinner, cx } from '@/components/ui';
import { pluralize } from '@/lib/format';

/** Row of filter pills (toggle buttons) for switching a list between views. */
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
    <div role="group" aria-label={label} className="flex max-w-full flex-wrap gap-2">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cx(
              'inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors',
              active ? 'border-ink-900 bg-ink-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50 hover:text-ink-900',
            )}
          >
            {option.label}
            {option.count !== undefined && option.count > 0 && (
              <span className="rounded-full bg-warning-100 px-1.5 text-xs font-semibold tabular-nums text-warning-800">{option.count}</span>
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
      <SearchInput key={value} id={id} name="q" defaultValue={value} placeholder={placeholder} className="flex-1" />
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
      <p className="flex items-center gap-2 text-sm text-slate-600" aria-live="polite">
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

/** Accessible on/off switch. The off track is slate-400 so it keeps 3:1 contrast against white. */
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
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-55',
        checked ? 'bg-success-600' : 'bg-slate-400',
      )}
    >
      <span
        aria-hidden="true"
        className={cx('inline-block size-5 rounded-full bg-white shadow-sm motion-safe:transition-transform', checked ? 'translate-x-5.5' : 'translate-x-0.5')}
      />
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
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 shrink-0 cursor-pointer"
        aria-describedby={description ? `${id}-description` : undefined}
      />
      <div className="text-sm">
        <label htmlFor={id} className="cursor-pointer font-medium text-ink-900">
          {label}
        </label>
        {description && (
          <p id={`${id}-description`} className="mt-0.5 text-slate-600">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
