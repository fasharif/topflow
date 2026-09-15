'use client';

import { useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Alert, Button } from '@/components/ui';
import { errorMessage } from '@/lib/api';

type ButtonProps = ComponentProps<typeof Button>;

interface ConfirmDialogProps {
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  /** Performs the action. Throwing keeps the dialog open and shows the error message. */
  onConfirm: () => Promise<void>;
  /** Called after the dialog closes (cancelled or confirmed). Unmount the dialog here. */
  onClose: () => void;
}

/**
 * Modal confirmation on the native <dialog> element: focus is trapped, Esc cancels and focus
 * returns to the trigger. The dialog is open for as long as it is mounted.
 */
export function ConfirmDialog({ title, description, confirmLabel, tone = 'danger', onConfirm, onClose }: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const dismiss = () => {
    const dialog = ref.current;
    // Closing natively fires `close`, which reports back through onClose and restores focus.
    if (dialog?.open) dialog.close();
    else onClose();
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      dismiss();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(event) => {
        if (busy) event.preventDefault();
      }}
      // Reset text styles inherited from the trigger's context (dialogs often live inside table cells).
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-slate-200 bg-white p-0 text-left text-sm font-normal tracking-normal whitespace-normal text-slate-700 normal-case shadow-xl backdrop:bg-ink-950/40"
    >
      <div className="px-5 pt-5 pb-4">
        <h2 id={titleId} className="text-base font-semibold text-ink-900">
          {title}
        </h2>
        {description && <div className="mt-2 space-y-2 leading-relaxed text-slate-600">{description}</div>}
        {error && (
          <div className="mt-4">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2 rounded-b-xl border-t border-slate-100 bg-slate-50 px-5 py-3">
        <Button variant="secondary" onClick={dismiss} disabled={busy}>
          Cancel
        </Button>
        <Button variant={tone} loading={busy} onClick={confirm}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}

/** A button that asks for confirmation in a modal before running its action. */
export function ConfirmButton({
  children,
  variant = 'secondary',
  size = 'sm',
  disabled,
  className,
  ...dialog
}: Omit<ConfirmDialogProps, 'onClose'> & {
  children: ReactNode;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} disabled={disabled} className={className} onClick={() => setOpen(true)}>
        {children}
      </Button>
      {open && <ConfirmDialog {...dialog} onClose={() => setOpen(false)} />}
    </>
  );
}
