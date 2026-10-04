'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from './cx';

/**
 * Horizontal scroll container for content that can be wider than the space it gets, such as a
 * table on a phone. While its content overflows it is a named region that can be focused and
 * scrolled with the arrow keys (WCAG 2.1.1 Keyboard; axe rule scrollable-region-focusable). When
 * everything fits it is a plain box, so it adds no tab stop and no landmark. It starts out
 * focusable, so content that overflows is never out of keyboard reach before it is measured.
 */
export function ScrollRegion({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = useState(true);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    // A ResizeObserver reports every observed element once when observation starts, so this also
    // takes the first measurement.
    const observer = new ResizeObserver(() => setScrolls(element.scrollWidth > element.clientWidth));
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      role={scrolls ? 'region' : undefined}
      aria-label={scrolls ? label : undefined}
      tabIndex={scrolls ? 0 : undefined}
      className={cx('overflow-x-auto', className)}
    >
      {children}
    </div>
  );
}
