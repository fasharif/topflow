import { ArrowUpRight, Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '@/components/ui';
import { COMPANY, locationLine } from '@/lib/company';

interface Channel {
  id: 'call' | 'whatsapp' | 'email';
  label: string;
  value: string;
  /** Short text used by the compact variant. */
  short: string;
  description: string;
  href: string;
  external: boolean;
  icon: ReactNode;
}

const CHANNELS: Channel[] = [
  {
    id: 'call',
    label: 'Call',
    value: COMPANY.phone,
    short: COMPANY.phone,
    description: 'Speak to our sales team',
    href: COMPANY.phoneHref,
    external: false,
    icon: <Phone aria-hidden="true" />,
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    value: 'Chat with sales',
    short: 'WhatsApp',
    description: 'Message us on WhatsApp',
    href: COMPANY.whatsappHref,
    external: true,
    icon: <MessageCircle aria-hidden="true" />,
  },
  {
    id: 'email',
    label: 'Email',
    value: COMPANY.email,
    short: COMPANY.email,
    description: 'Send an enquiry or project documents',
    href: COMPANY.emailHref,
    external: false,
    icon: <Mail aria-hidden="true" />,
  },
];

const externalProps = { target: '_blank', rel: 'noopener noreferrer' } as const;

/**
 * Call, WhatsApp and email links, used everywhere contact details appear.
 * `compact` is an inline list (header, menu, footer, forms); `full` is a row of cards.
 */
export function ContactOptions({
  variant = 'compact',
  tone = 'light',
  layout = 'row',
  size = 'md',
  className,
}: {
  variant?: 'compact' | 'full';
  tone?: 'light' | 'dark';
  /** Compact only: a wrapping row or a vertical list. */
  layout?: 'row' | 'column';
  /** Compact only. */
  size?: 'sm' | 'md';
  className?: string;
}) {
  if (variant === 'full') {
    return (
      <ul className={cx('grid gap-4 sm:grid-cols-3', className)}>
        {CHANNELS.map((channel) => (
          <li key={channel.id}>
            <a
              href={channel.href}
              {...(channel.external ? externalProps : undefined)}
              className="group flex h-full gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-brand-300 hover:shadow-raised sm:flex-col"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700 [&_svg]:size-5">{channel.icon}</span>
              <span className="flex min-w-0 flex-col">
                <span className="eyebrow text-slate-600">{channel.label}</span>
                <span className="mt-1 font-semibold break-words text-ink-900 group-hover:text-brand-700">{channel.value}</span>
                <span className="mt-1 text-sm text-slate-600">{channel.description}</span>
                {channel.external && <span className="sr-only"> (opens in a new tab)</span>}
              </span>
            </a>
          </li>
        ))}
      </ul>
    );
  }

  const dark = tone === 'dark';
  return (
    <ul
      className={cx(
        layout === 'column' ? 'grid gap-2.5' : 'flex flex-wrap items-center gap-x-5 gap-y-1.5',
        size === 'sm' ? 'text-xs' : 'text-sm',
        className,
      )}
    >
      {CHANNELS.map((channel) => (
        <li key={channel.id}>
          <a
            href={channel.href}
            {...(channel.external ? externalProps : undefined)}
            className={cx(
              'inline-flex items-center gap-2 rounded-sm font-medium break-all transition-colors [&_svg]:shrink-0',
              size === 'sm' ? '[&_svg]:size-3.5' : '[&_svg]:size-4',
              dark ? 'text-slate-200 hover:text-white [&_svg]:text-brand-200' : 'text-ink-900 hover:text-brand-700 [&_svg]:text-brand-600',
            )}
          >
            {channel.icon}
            {channel.id !== 'whatsapp' && <span className="sr-only">{channel.label}: </span>}
            <span>{channel.short}</span>
            {channel.external && <span className="sr-only"> (opens in a new tab)</span>}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** One-line location: the service area until a street address is published. */
export function ServiceArea({ tone = 'light', className }: { tone?: 'light' | 'dark'; className?: string }) {
  return (
    <p className={cx('inline-flex items-center gap-2', tone === 'dark' ? 'text-slate-300' : 'text-slate-600', className)}>
      <MapPin aria-hidden="true" className={cx('size-4 shrink-0', tone === 'dark' ? 'text-brand-200' : 'text-brand-600')} />
      {locationLine()}
    </p>
  );
}

/** Location card: published address and map link, or the service area; opening hours when known. */
export function CompanyLocation({ className }: { className?: string }) {
  return (
    <div className={cx('rounded-xl border border-slate-200 bg-white p-5 shadow-xs', className)}>
      <div className="flex gap-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-flow-50 text-flow-700">
          <MapPin aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="eyebrow text-slate-600">Location</p>
          {COMPANY.address ? (
            <address className="mt-1 font-semibold not-italic text-ink-900">
              {COMPANY.address.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </address>
          ) : (
            <p className="mt-1 font-semibold text-ink-900">{COMPANY.serviceArea}</p>
          )}
          <p className="text-sm text-slate-600">{COMPANY.country}</p>
          {COMPANY.mapUrl && (
            <a
              href={COMPANY.mapUrl}
              {...externalProps}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 underline-offset-4 hover:underline"
            >
              Open in Google Maps
              <ArrowUpRight aria-hidden="true" className="size-4" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
        </div>
      </div>
      {COMPANY.hours && COMPANY.hours.length > 0 && (
        <div className="mt-5 border-t border-slate-200 pt-4">
          <p className="eyebrow flex items-center gap-2 text-slate-600">
            <Clock aria-hidden="true" className="size-4" />
            Opening hours
          </p>
          <dl className="mt-2 grid gap-1 text-sm">
            {COMPANY.hours.map((entry) => (
              <div key={entry.days} className="flex justify-between gap-4">
                <dt className="text-slate-600">{entry.days}</dt>
                <dd className="font-medium text-ink-900">{entry.time}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
