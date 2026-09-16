'use client';

import { Info } from 'lucide-react';
import { cloneElement, useEffect, useId, useRef, useState, type FocusEvent, type MouseEvent, type ReactElement, type ReactNode } from 'react';
import { cx } from './cx';

interface TriggerProps {
  'aria-describedby'?: string;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  onFocus?: (event: FocusEvent<HTMLElement>) => void;
  onBlur?: (event: FocusEvent<HTMLElement>) => void;
}

/**
 * Short supplementary text for a single trigger element, styled with CSS only. It appears on hover,
 * keyboard focus or tap, stays visible while the pointer is over it and closes on Escape
 * (WCAG 1.4.13). The trigger references the text with aria-describedby, so screen readers
 * announce it together with the control.
 *
 * `anchor="parent"` positions the bubble against the nearest positioned ancestor instead of the
 * trigger, so it never runs past a narrow card.
 */
export function Tooltip({
  content,
  children,
  side = 'top',
  align = 'center',
  anchor = 'trigger',
  className,
}: {
  content: ReactNode;
  children: ReactElement<TriggerProps>;
  side?: 'top' | 'bottom';
  align?: 'start' | 'center' | 'end';
  anchor?: 'trigger' | 'parent';
  className?: string;
}) {
  const id = useId();
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [open]);

  const trigger = cloneElement(children, {
    'aria-describedby': cx(children.props['aria-describedby'], id),
    onClick: (event: MouseEvent<HTMLElement>) => {
      children.props.onClick?.(event);
      setDismissed(false);
      setOpen((value) => !value);
    },
    onFocus: (event: FocusEvent<HTMLElement>) => {
      children.props.onFocus?.(event);
      if (event.currentTarget.matches(':focus-visible')) {
        setDismissed(false);
        setOpen(true);
      }
    },
    onBlur: (event: FocusEvent<HTMLElement>) => {
      children.props.onBlur?.(event);
      setOpen(false);
    },
  });

  const position =
    anchor === 'parent'
      ? 'left-0 max-w-[min(20rem,100%)]'
      : cx(
          'max-w-[min(18rem,calc(100vw-2rem))]',
          align === 'start' ? '-left-1' : align === 'end' ? '-right-1' : 'left-1/2 -translate-x-1/2',
        );

  return (
    <span
      ref={wrapperRef}
      className={cx('group/tooltip inline-flex', anchor === 'trigger' && 'relative', className)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setOpen(false);
          setDismissed(true);
        }
      }}
      onPointerLeave={() => setDismissed(false)}
    >
      {trigger}
      <span
        role="tooltip"
        id={id}
        className={cx(
          'absolute z-30 w-max transition-opacity duration-150',
          side === 'top' ? 'bottom-full pb-2' : 'top-full pt-2',
          position,
          dismissed
            ? 'invisible opacity-0'
            : open
              ? 'visible opacity-100'
              : 'invisible opacity-0 group-hover/tooltip:visible group-hover/tooltip:opacity-100',
        )}
      >
        <span className="block rounded-lg bg-ink-900 px-3 py-2 text-left text-xs leading-relaxed font-normal tracking-normal text-white normal-case shadow-lg">
          {content}
        </span>
      </span>
    </span>
  );
}

/** Round "i" button that explains the element next to it. `label` names the button. */
export function InfoTooltip({
  label,
  children,
  side,
  align = 'start',
  anchor,
  className,
}: {
  label: string;
  children: ReactNode;
  side?: 'top' | 'bottom';
  align?: 'start' | 'center' | 'end';
  anchor?: 'trigger' | 'parent';
  className?: string;
}) {
  return (
    <Tooltip content={children} side={side} align={align} anchor={anchor} className={className}>
      <button
        type="button"
        aria-label={label}
        className="grid size-6 cursor-pointer place-items-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-flow-700"
      >
        <Info aria-hidden="true" className="size-4" />
      </button>
    </Tooltip>
  );
}
