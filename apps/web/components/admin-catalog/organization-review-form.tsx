'use client';

import {
  ORG_STATUS_LABELS,
  OrgStatus,
  PAYMENT_TERMS_LABELS,
  reviewOrganizationSchema,
  type OrganizationDto,
  type PaymentTerms,
} from '@topflow/shared';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Card, CardHeader, Field, Input, Select, cx } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { aed } from '@/lib/format';
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from '@/lib/forms';
import { formatPercent, parseAmount } from './helpers';

const STATUS_EXPLANATIONS: Record<OrgStatus, string> = {
  PENDING_VERIFICATION: 'Members can browse and request quotations, but cannot accept quotations until the account is verified.',
  ACTIVE: 'Verified. Members see negotiated trade prices, can accept quotations and buy on the agreed payment terms.',
  SUSPENDED: 'Members are blocked from the trade portal until the account is reactivated.',
};

interface Draft {
  status: OrgStatus;
  paymentTerms: PaymentTerms;
  creditLimit: string;
  discountRate: string;
}

/** Same amount once normalised to fils ("5000" equals "5000.00"); invalid input never matches. */
function sameAmount(input: string, current: string): boolean {
  const fils = parseAmount(input);
  return fils !== null && fils === parseAmount(current);
}

function changesFrom(draft: Draft, organization: OrganizationDto): Record<string, unknown> {
  const changes: Record<string, unknown> = {};
  if (draft.status !== organization.status) changes.status = draft.status;
  if (draft.paymentTerms !== organization.paymentTerms) changes.paymentTerms = draft.paymentTerms;
  if (!sameAmount(draft.creditLimit, organization.creditLimit)) changes.creditLimit = draft.creditLimit.trim();
  if (!sameAmount(draft.discountRate, organization.discountRate)) changes.discountRate = Number(draft.discountRate);
  return changes;
}

/**
 * KYC decision and commercial terms. Only changed fields are sent, so the audit trail records
 * exactly what the reviewer decided. Render with a `key` derived from the saved terms so the
 * form resets whenever the organization changes on the server.
 */
export function OrganizationReviewForm({ organization, onSaved }: { organization: OrganizationDto; onSaved: (organization: OrganizationDto) => void }) {
  const [draft, setDraft] = useState<Draft>({
    status: organization.status,
    paymentTerms: organization.paymentTerms,
    creditLimit: organization.creditLimit,
    discountRate: organization.discountRate,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const changes = changesFrom(draft, organization);
  const dirty = Object.keys(changes).length > 0;
  const suspending = draft.status === OrgStatus.SUSPENDED && organization.status !== OrgStatus.SUSPENDED;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const parsed = reviewOrganizationSchema.safeParse(changes);
    const nextErrors: FieldErrors = parsed.success ? {} : zodFieldErrors(parsed.error);
    // An empty percentage would silently coerce to 0 %, so require an explicit value.
    if (draft.discountRate.trim() === '') nextErrors.discountRate = 'Enter a percentage (0 for no discount)';
    setErrors(nextErrors);
    if (!parsed.success || Object.keys(nextErrors).length > 0) {
      if (nextErrors['']) setError(nextErrors['']);
      return;
    }

    setSaving(true);
    try {
      const updated = await api<OrganizationDto>(`/admin/organizations/${organization.id}/review`, { method: 'PATCH', body: parsed.data });
      onSaved(updated);
    } catch (err) {
      setError(errorMessage(err));
      setErrors(apiFieldErrors(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader title="KYC & commercial terms" description="Verify the company's documents, then agree how this organization buys from Top Flow." />
      <form onSubmit={submit} noValidate className="space-y-5 p-5">
        <Field label="Account status" htmlFor="review-status" error={errors.status}>
          <Select id="review-status" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as OrgStatus })} aria-invalid={Boolean(errors.status)}>
            {Object.entries(ORG_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        <ul className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          {Object.values(OrgStatus).map((value) => (
            <li key={value} className={cx('flex gap-2', value === draft.status && 'font-medium text-ink-900')}>
              <span aria-hidden="true" className={cx('mt-1 size-1.5 shrink-0 rounded-full', value === draft.status ? 'bg-brand-600' : 'bg-slate-400')} />
              <span>
                <span className="font-semibold">{ORG_STATUS_LABELS[value]}:</span> {STATUS_EXPLANATIONS[value]}
              </span>
            </li>
          ))}
        </ul>

        <Field label="Payment terms" htmlFor="review-terms" error={errors.paymentTerms} hint="Prepaid accounts pay before dispatch; net terms buy on credit.">
          <Select id="review-terms" value={draft.paymentTerms} onChange={(e) => setDraft({ ...draft, paymentTerms: e.target.value as PaymentTerms })} aria-invalid={Boolean(errors.paymentTerms)}>
            {Object.entries(PAYMENT_TERMS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Credit limit (AED)" htmlFor="review-credit" error={errors.creditLimit} hint={`Currently ${aed(organization.creditLimit)}`}>
            <Input
              id="review-credit"
              inputMode="decimal"
              autoComplete="off"
              value={draft.creditLimit}
              onChange={(e) => setDraft({ ...draft, creditLimit: e.target.value })}
              aria-invalid={Boolean(errors.creditLimit)}
              placeholder="50000.00"
            />
          </Field>
          <Field label="Trade discount (%)" htmlFor="review-discount" error={errors.discountRate} hint={`Currently ${formatPercent(organization.discountRate)} off list prices`}>
            <Input
              id="review-discount"
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step={0.01}
              value={draft.discountRate}
              onChange={(e) => setDraft({ ...draft, discountRate: e.target.value })}
              aria-invalid={Boolean(errors.discountRate)}
            />
          </Field>
        </div>

        {suspending && (
          <Alert tone="warning" title="Saving will suspend this organization">
            Its members will immediately lose access to the trade portal.
          </Alert>
        )}
        {error && <Alert tone="danger">{error}</Alert>}

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-4">
          {!dirty && <span className="text-xs text-slate-500">No unsaved changes</span>}
          <Button type="submit" loading={saving} disabled={!dirty} variant={suspending ? 'danger' : 'primary'}>
            {suspending ? 'Suspend & save terms' : 'Save decision'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
