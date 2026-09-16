import type { ComponentProps, ReactNode } from 'react';
import { cx } from './cx';

const cardTones = {
  default: 'border-slate-200 bg-white',
  muted: 'border-slate-200 bg-slate-50',
  brand: 'border-brand-200 bg-brand-50',
  warning: 'border-warning-200 bg-warning-50',
} as const;

export type CardTone = keyof typeof cardTones;

/** White panel with the standard border, radius and shadow. Use `tone` rather than overriding the background. */
export function Card({ tone = 'default', className, ...props }: ComponentProps<'div'> & { tone?: CardTone }) {
  return <div className={cx('rounded-xl border shadow-xs', cardTones[tone], className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4', className)}>
      <div className="min-w-0">
        <h2 className="heading-4 text-ink-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-slate-600">{description}</p>}
      </div>
      {action}
    </div>
  );
}

const statTones = {
  neutral: 'border-slate-200 bg-white',
  warning: 'border-warning-200 bg-warning-50',
  brand: 'border-brand-200 bg-brand-50',
} as const;

export function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: keyof typeof statTones;
  /** Optional Lucide icon element shown beside the label. */
  icon?: ReactNode;
}) {
  return (
    <div className={cx('rounded-xl border p-5 shadow-xs', statTones[tone])}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-600">{label}</p>
        {icon && <span className="text-slate-500 [&_svg]:size-4.5">{icon}</span>}
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-ink-900">{value}</p>
      {hint && <div className="mt-1 text-xs text-slate-600">{hint}</div>}
    </div>
  );
}
