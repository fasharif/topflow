import { CircleAlert, Search } from 'lucide-react';
import { cloneElement, isValidElement, type ComponentProps, type ReactNode } from 'react';
import { cx } from './cx';

/** Shared look of text inputs, selects and textareas (rounded-lg, 3:1 border, 2px focus ring). */
export const controlClass =
  'block w-full rounded-lg border border-slate-400 bg-white px-3 text-sm text-ink-900 shadow-xs transition-colors placeholder:text-slate-500 hover:border-slate-500 focus:border-flow-600 focus:outline-2 focus:-outline-offset-1 focus:outline-flow-600 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-500 aria-[invalid=true]:border-danger-600';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cx(controlClass, 'h-10', className)} {...props} />;
}

export function Textarea({ className, rows = 3, ...props }: ComponentProps<'textarea'>) {
  return <textarea rows={rows} className={cx(controlClass, 'py-2 leading-relaxed', className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cx(controlClass, 'h-10 pr-8', className)} {...props} />;
}

/** Search input with a leading magnifier icon. `className` styles the wrapper. */
export function SearchInput({
  className,
  size = 'md',
  ...props
}: Omit<ComponentProps<'input'>, 'type' | 'size'> & { size?: 'md' | 'lg' }) {
  const large = size === 'lg';
  return (
    <div className={cx('relative min-w-0', className)}>
      <Search
        aria-hidden="true"
        className={cx('pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-500', large ? 'left-4 size-5' : 'left-3 size-4')}
      />
      <input type="search" className={cx(controlClass, large ? 'h-12 pl-11 text-base' : 'h-10 pl-9')} {...props} />
    </div>
  );
}

/**
 * Label, control and its hint or error. The hint or error is linked to the control with
 * aria-describedby automatically when the child is a single element.
 */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  optional = false,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor: string;
  error?: string;
  hint?: ReactNode;
  /** Shows an "Optional" tag next to the label. */
  optional?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const messageId = error ? `${htmlFor}-error` : hint ? `${htmlFor}-hint` : undefined;
  const control =
    messageId && isValidElement<{ 'aria-describedby'?: string }>(children)
      ? cloneElement(children, { 'aria-describedby': cx(children.props['aria-describedby'], messageId) })
      : children;

  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between gap-3 text-sm font-medium text-ink-900">
        <span>{label}</span>
        {optional && <span className="text-xs font-normal text-slate-500">Optional</span>}
      </label>
      {control}
      {error ? (
        <p id={messageId} role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-danger-700">
          <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="mt-1.5 text-xs text-slate-600">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
