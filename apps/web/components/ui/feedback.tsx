import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from './cx';

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'brand';

const badgeTones: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  info: 'bg-flow-50 text-flow-700 ring-flow-200',
  success: 'bg-success-50 text-success-700 ring-success-200',
  warning: 'bg-warning-50 text-warning-800 ring-warning-200',
  danger: 'bg-danger-50 text-danger-700 ring-danger-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset [&_svg]:size-3.5 [&_svg]:shrink-0',
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

type AlertTone = Exclude<Tone, 'brand' | 'neutral'>;

const alertTones: Record<AlertTone, { box: string; icon: ReactNode }> = {
  info: { box: 'border-flow-200 bg-flow-50 text-flow-900', icon: <Info aria-hidden="true" className="text-flow-600" /> },
  success: { box: 'border-success-200 bg-success-50 text-success-900', icon: <CircleCheck aria-hidden="true" className="text-success-600" /> },
  warning: { box: 'border-warning-200 bg-warning-50 text-warning-900', icon: <TriangleAlert aria-hidden="true" className="text-warning-600" /> },
  danger: { box: 'border-danger-200 bg-danger-50 text-danger-900', icon: <CircleAlert aria-hidden="true" className="text-danger-600" /> },
};

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const style = alertTones[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cx('flex gap-3 rounded-lg border px-4 py-3 text-sm [&>svg]:mt-0.5 [&>svg]:size-4.5 [&>svg]:shrink-0', style.box, className)}
    >
      {style.icon}
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-1' : undefined}>{children}</div>}
      </div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle aria-hidden="true" className={cx('animate-spin', className ?? 'size-5')} />;
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-16 text-sm text-slate-600">
      <Spinner className="size-5 text-brand-600" />
      {label}
    </div>
  );
}

/** Placeholder shape for loading skeletons (hidden from assistive technology). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx('animate-pulse rounded-md bg-slate-200/80', className)} />;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  /** A Lucide icon element, shown in a round tile above the title. */
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center', className)}>
      {icon && <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-slate-100 text-slate-600 [&_svg]:size-6">{icon}</div>}
      <p className="heading-3 text-ink-900">{title}</p>
      {description && <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-slate-600">{description}</p>}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  );
}
