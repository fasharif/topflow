import Link from 'next/link';
import type { ComponentProps } from 'react';
import { cx } from './cx';
import { Spinner } from './feedback';

/**
 * `light` and `outline-light` are for dark bands, `soft` is the brand-tinted confirmation state
 * (for example "View quote" after adding a product), and `danger-outline` / `danger-ghost` are quieter
 * destructive actions ("Cancel order", "Discard draft"). Pick a variant instead of overriding
 * colours with className.
 */
export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'soft'
  | 'ghost'
  | 'danger'
  | 'danger-outline'
  | 'danger-ghost'
  | 'dark'
  | 'light'
  | 'outline-light';
export type ButtonSize = 'sm' | 'md' | 'lg';

const buttonBase =
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55 [&_svg]:shrink-0';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white shadow-xs hover:bg-brand-700 active:bg-brand-800',
  secondary: 'border border-slate-300 bg-white text-ink-900 shadow-xs hover:border-slate-400 hover:bg-slate-50',
  soft: 'border border-brand-200 bg-brand-50 text-brand-800 hover:border-brand-300 hover:bg-brand-100',
  ghost: 'text-slate-700 hover:bg-slate-100 hover:text-ink-900',
  danger: 'bg-danger-600 text-white shadow-xs hover:bg-danger-700',
  'danger-outline': 'border border-danger-200 bg-white text-danger-700 shadow-xs hover:border-danger-500 hover:bg-danger-50',
  'danger-ghost': 'text-danger-700 hover:bg-danger-50 hover:text-danger-800',
  dark: 'bg-ink-900 text-white hover:bg-ink-800',
  light: 'bg-white text-ink-900 hover:bg-slate-100',
  'outline-light': 'border border-white/40 text-white hover:border-white/70 hover:bg-white/10',
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3.5 text-sm [&_svg]:size-4',
  md: 'h-10 px-4.5 text-sm [&_svg]:size-4',
  lg: 'h-12 px-6 text-base [&_svg]:size-4.5',
};

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string): string {
  return cx(buttonBase, buttonVariants[variant], buttonSizes[size], className);
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean }) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
}

export function LinkButton({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export type IconButtonVariant = 'ghost' | 'secondary' | 'primary' | 'ghost-light';

const iconButtonVariants: Record<IconButtonVariant, string> = {
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-ink-900',
  secondary: 'border border-slate-300 bg-white text-ink-900 shadow-xs hover:border-slate-400 hover:bg-slate-50',
  primary: 'bg-brand-600 text-white shadow-xs hover:bg-brand-700',
  'ghost-light': 'text-white hover:bg-white/10',
};

const iconButtonSizes: Record<ButtonSize, string> = {
  sm: 'size-8 [&_svg]:size-4',
  md: 'size-10 [&_svg]:size-4.5',
  lg: 'size-12 [&_svg]:size-5',
};

/** Round icon-only button; `label` is its accessible name. Pass the icon as children. */
export function IconButton({
  label,
  variant = 'ghost',
  size = 'md',
  className,
  type = 'button',
  ...props
}: Omit<ComponentProps<'button'>, 'aria-label'> & { label: string; variant?: IconButtonVariant; size?: ButtonSize }) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cx(
        'inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-55 [&_svg]:shrink-0',
        iconButtonVariants[variant],
        iconButtonSizes[size],
        className,
      )}
      {...props}
    />
  );
}
