import { ArrowLeft, ArrowRight, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { cx } from './cx';

/** The single page width used across the app. */
export const containerClass = 'mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8';

export function Container({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cx(containerClass, className)} {...props} />;
}

type SectionTone = 'default' | 'white' | 'dark';

const sectionTones: Record<SectionTone, string> = {
  default: '',
  white: 'border-y border-slate-200 bg-white',
  dark: 'bg-ink-900 text-slate-300',
};

/** Full-width band with the standard vertical rhythm and a Container inside. */
export function Section({
  tone = 'default',
  decoration,
  className,
  containerClassName,
  children,
  ...props
}: ComponentProps<'section'> & {
  tone?: SectionTone;
  /** Decorative background (for example FlowLines) rendered behind the content. */
  decoration?: ReactNode;
  containerClassName?: string;
}) {
  return (
    <section
      data-surface={tone === 'dark' ? 'dark' : undefined}
      className={cx('relative py-16 sm:py-20', decoration ? 'isolate overflow-hidden' : undefined, sectionTones[tone], className)}
      {...props}
    >
      {decoration}
      <Container className={cx('relative', containerClassName)}>{children}</Container>
    </section>
  );
}

/** Eyebrow, title, description and an optional "view all" link at the top of a section. */
export function SectionHeading({
  id,
  eyebrow,
  title,
  description,
  action,
  align = 'start',
  tone = 'default',
  className,
}: {
  /** Id of the heading, for `aria-labelledby` on the section. */
  id?: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: { href: string; label: string };
  align?: 'start' | 'center';
  tone?: 'default' | 'dark';
  className?: string;
}) {
  const dark = tone === 'dark';
  return (
    <div
      className={cx(
        'flex flex-wrap gap-x-8 gap-y-4',
        align === 'center' ? 'flex-col items-center text-center' : 'items-end justify-between',
        className,
      )}
    >
      <div className="max-w-2xl">
        {eyebrow && <p className={cx('eyebrow', dark ? 'text-brand-200' : 'text-brand-700')}>{eyebrow}</p>}
        <h2 id={id} className={cx('heading-2', eyebrow ? 'mt-3' : undefined, dark ? 'text-white' : 'text-ink-900')}>
          {title}
        </h2>
        {description && <p className={cx('mt-3 text-base leading-relaxed', dark ? 'text-slate-300' : 'text-slate-600')}>{description}</p>}
      </div>
      {action && (
        <ArrowLink href={action.href} className={dark ? 'text-white hover:text-brand-200' : undefined}>
          {action.label}
        </ArrowLink>
      )}
    </div>
  );
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-slate-600">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
              {index > 0 && <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-slate-400" />}
              {item.href && !last ? (
                <Link href={item.href} className="truncate underline-offset-4 hover:text-brand-700 hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? 'page' : undefined} className={cx('truncate', last && 'font-medium text-ink-900')}>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  breadcrumbs,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  className?: string;
}) {
  return (
    <div className={cx('mb-8', className)}>
      {breadcrumbs && <Breadcrumbs items={breadcrumbs} className="mb-4" />}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          {eyebrow && <div className="eyebrow mb-2 text-brand-700">{eyebrow}</div>}
          <h1 className="heading-1 text-ink-900">{title}</h1>
          {description && <div className="mt-2 text-base leading-relaxed text-slate-600">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** Text link with a trailing arrow icon, e.g. "View all products". */
export function ArrowLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cx(
        'group inline-flex items-center gap-1.5 text-sm font-semibold underline-offset-4 hover:underline',
        className ?? 'text-brand-700 hover:text-brand-800',
      )}
    >
      {children}
      <ArrowRight aria-hidden="true" className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

/** Link back to a parent list (leading arrow icon), e.g. "Orders". */
export function BackLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cx('group mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-brand-700', className)}
    >
      <ArrowLeft aria-hidden="true" className="size-4 shrink-0 transition-transform group-hover:-translate-x-0.5" />
      {children}
    </Link>
  );
}
