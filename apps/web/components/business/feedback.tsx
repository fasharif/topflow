'use client';

import { RotateCcw, SearchX } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { Alert, Button, EmptyState, LinkButton } from '@/components/ui';
import type { ApiError } from '@/lib/api';

// Kept here so existing trade-portal imports of `BackLink` resolve to the shared kit version.
export { BackLink } from '@/components/ui';

/** Error state for a failed query, with a friendly "not found" variant for detail pages. */
export function LoadError({
  error,
  onRetry,
  notFound,
}: {
  error: ApiError;
  onRetry: () => void;
  notFound?: { title: string; description?: string; href: string; label: string };
}) {
  // 400 = malformed id in the URL, 404 = not found in (or not visible to) this organization.
  if (notFound && (error.status === 404 || error.status === 400)) {
    return (
      <EmptyState
        icon={<SearchX aria-hidden="true" />}
        title={notFound.title}
        description={notFound.description}
        action={
          <LinkButton href={notFound.href} variant="secondary">
            {notFound.label}
          </LinkButton>
        }
      />
    );
  }
  return (
    <Alert tone="danger" title="We couldn't load this page">
      <p>{error.message}</p>
      <Button variant="secondary" size="sm" onClick={onRetry} className="mt-3">
        <RotateCcw aria-hidden="true" />
        Try again
      </Button>
    </Alert>
  );
}

/**
 * One-off confirmation banner driven by a query flag such as `?submitted=1`. Uses
 * `useSearchParams`, so render it inside `<Suspense>`.
 */
export function FlagAlert({
  flag,
  title,
  tone = 'success',
  children,
}: {
  flag: string;
  title: string;
  tone?: 'success' | 'info';
  children?: ReactNode;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  if (params.get(flag) !== '1') return null;

  const dismiss = () => {
    const next = new URLSearchParams(params.toString());
    next.delete(flag);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <Alert tone={tone} title={title} className="mb-6">
      {children}
      <div className="mt-2">
        <button
          type="button"
          onClick={dismiss}
          className="inline-flex min-h-6 cursor-pointer items-center font-medium underline underline-offset-4 hover:no-underline"
        >
          Dismiss
        </button>
      </div>
    </Alert>
  );
}

type ButtonProps = ComponentProps<typeof Button>;

/** Destructive action with an inline second step instead of a blocking browser dialog. */
export function ConfirmAction({
  label,
  confirmLabel,
  prompt,
  onConfirm,
  variant = 'secondary',
  size = 'sm',
  disabled,
}: {
  label: string;
  confirmLabel: string;
  prompt?: string;
  /** Handle (and display) errors inside; the control resets once the promise settles. */
  onConfirm: () => Promise<void>;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  disabled?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!confirming) {
    return (
      <Button variant={variant} size={size} disabled={disabled} onClick={() => setConfirming(true)}>
        {label}
      </Button>
    );
  }

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2" role="group" aria-label={prompt ?? label}>
      {prompt && <span className="text-sm font-medium text-ink-900">{prompt}</span>}
      <Button variant="danger" size={size} loading={busy} onClick={() => void confirm()}>
        {confirmLabel}
      </Button>
      <Button variant="ghost" size={size} disabled={busy} onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </span>
  );
}
