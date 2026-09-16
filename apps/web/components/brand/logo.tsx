import Image from 'next/image';
import Link from 'next/link';
import { cx } from '@/components/ui';
import logoMark from '@/public/brand/logo-mark.png';

/** Logo mark with the "TOP FLOW" wordmark and a "HUB" tag. Use `inverse` on dark backgrounds. */
export function Logo({ tone = 'default', className }: { tone?: 'default' | 'inverse'; className?: string }) {
  const inverse = tone === 'inverse';
  return (
    <Link href="/" aria-label="TopFlow Hub home" className={cx('inline-flex shrink-0 items-center gap-2.5 rounded-md', className)}>
      <Image src={logoMark} alt="" width={36} height={36} loading="eager" className="size-9" />
      <span className="flex items-center gap-2" aria-hidden="true">
        <span className={cx('text-base font-bold tracking-wordmark', inverse ? 'text-white' : 'text-ink-900')}>TOP FLOW</span>
        <span
          className={cx(
            'eyebrow rounded-md px-1.5 py-0.5 ring-1 ring-inset',
            inverse ? 'bg-white/10 text-flow-200 ring-white/20' : 'bg-flow-50 text-flow-700 ring-flow-200',
          )}
        >
          HUB
        </span>
      </span>
    </Link>
  );
}
