'use client';

import {
  ORG_TYPE_LABELS,
  OrgPermission,
  OrgStatus,
  OrgType,
  PAYMENT_TERMS_LABELS,
  PaymentTerms,
  enumValues,
  updateOrganizationSchema,
  type OrganizationDto,
  type UpdateOrganizationInput,
} from '@topflow/shared';
import { useState, type FormEvent } from 'react';
import { DetailItem, DetailList } from '@/components/business/detail-list';
import { formatPercent } from '@/components/business/document-lines';
import { LoadError } from '@/components/business/feedback';
import { useOrg } from '@/components/business/use-org';
import { OrgStatusBadge } from '@/components/status-badge';
import { Alert, Button, Card, CardHeader, Field, Input, LoadingBlock, PageHeader, Select } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from '@/lib/forms';
import { aed, formatDate } from '@/lib/format';
import { refreshSession } from '@/lib/session';
import { useApiQuery } from '@/lib/use-api';

interface ProfileDraft {
  name: string;
  legalName: string;
  type: OrgType;
  tradeLicenseNumber: string;
  trn: string;
  email: string;
  phoneNumber: string;
}

type TextKey = Exclude<keyof ProfileDraft, 'type'>;

function toDraft(organization: OrganizationDto): ProfileDraft {
  return {
    name: organization.name,
    legalName: organization.legalName ?? '',
    type: organization.type,
    tradeLicenseNumber: organization.tradeLicenseNumber ?? '',
    trn: organization.trn ?? '',
    email: organization.email ?? '',
    phoneNumber: organization.phoneNumber ?? '',
  };
}

/** Only the fields that differ from the saved profile, so an untouched TRN or licence never triggers re-verification. */
function changedFields(data: UpdateOrganizationInput, organization: OrganizationDto): UpdateOrganizationInput {
  const changes: UpdateOrganizationInput = {};
  if (data.name !== undefined && data.name !== organization.name) changes.name = data.name;
  if (data.legalName !== undefined && data.legalName !== organization.legalName) changes.legalName = data.legalName;
  if (data.type !== undefined && data.type !== organization.type) changes.type = data.type;
  if (data.tradeLicenseNumber !== undefined && data.tradeLicenseNumber !== organization.tradeLicenseNumber) changes.tradeLicenseNumber = data.tradeLicenseNumber;
  if (data.trn !== undefined && data.trn !== organization.trn) changes.trn = data.trn;
  if (data.email !== undefined && data.email !== organization.email) changes.email = data.email;
  if (data.phoneNumber !== undefined && data.phoneNumber !== organization.phoneNumber) changes.phoneNumber = data.phoneNumber;
  return changes;
}

function ProfileForm({ organization, onSaved }: { organization: OrganizationDto; onSaved: (organization: OrganizationDto, message: string) => void }) {
  const [draft, setDraft] = useState<ProfileDraft>(() => toDraft(organization));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const verified = organization.status === OrgStatus.ACTIVE;
  const identifiersChanged =
    draft.trn.trim() !== (organization.trn ?? '') || draft.tradeLicenseNumber.trim() !== (organization.tradeLicenseNumber ?? '');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const parsed = updateOrganizationSchema.safeParse({
      name: draft.name,
      legalName: draft.legalName,
      type: draft.type,
      tradeLicenseNumber: draft.tradeLicenseNumber,
      trn: draft.trn.trim() || undefined,
      email: draft.email.trim() || undefined,
      phoneNumber: draft.phoneNumber.trim() || undefined,
    });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    const changes = changedFields(parsed.data, organization);
    if (Object.keys(changes).length === 0) {
      setError('Nothing to save — the profile is unchanged.');
      return;
    }
    setSaving(true);
    try {
      const updated = await api<OrganizationDto>('/org', { method: 'PATCH', org: true, body: changes });
      const reverify = organization.status === OrgStatus.ACTIVE && updated.status === OrgStatus.PENDING_VERIFICATION;
      onSaved(
        updated,
        reverify
          ? 'Profile saved. Because a legal identifier changed, Top Flow will verify the account again before quotations can be accepted.'
          : 'Company profile saved.',
      );
    } catch (err) {
      setError(errorMessage(err));
      setErrors(apiFieldErrors(err));
      setSaving(false);
    }
  };

  const text = (key: TextKey, label: string, options: { hint?: string; type?: string; autoComplete?: string } = {}) => (
    <Field label={label} htmlFor={`org-${key}`} error={errors[key]} hint={options.hint}>
      <Input
        id={`org-${key}`}
        type={options.type ?? 'text'}
        autoComplete={options.autoComplete}
        value={draft[key]}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        aria-invalid={Boolean(errors[key])}
      />
    </Field>
  );

  const identifierHint = verified ? 'Changing this on a verified account sends it back to verification.' : undefined;

  return (
    <form onSubmit={submit} className="space-y-4 p-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        {text('name', 'Company name', { autoComplete: 'organization' })}
        {text('legalName', 'Legal name (optional)')}
        <Field label="Business type" htmlFor="org-type" error={errors.type}>
          <Select id="org-type" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as OrgType })}>
            {enumValues(OrgType).map((value) => (
              <option key={value} value={value}>
                {ORG_TYPE_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
        {text('tradeLicenseNumber', 'Trade licence number', { hint: identifierHint })}
        {text('trn', 'VAT TRN (optional)', { hint: identifierHint ?? '15 digits — printed on quotations and invoices' })}
        {text('email', 'Company email (optional)', { type: 'email', autoComplete: 'email' })}
        {text('phoneNumber', 'Company phone (optional)', { type: 'tel', autoComplete: 'tel' })}
      </div>

      {verified && identifiersChanged && (
        <Alert tone="warning" title="This will trigger re-verification">
          Changing the TRN or trade licence number sends {organization.name} back to verification. Quotations cannot be accepted until Top Flow has
          reviewed the new details.
        </Alert>
      )}
      {error && <Alert tone={error.startsWith('Nothing to save') ? 'info' : 'danger'}>{error}</Alert>}

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="ghost"
          disabled={saving}
          onClick={() => {
            setDraft(toDraft(organization));
            setErrors({});
            setError(null);
          }}
        >
          Reset
        </Button>
        <Button type="submit" loading={saving}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

function CompanyView({ initial }: { initial: OrganizationDto }) {
  const { can } = useOrg();
  const [organization, setOrganization] = useState(initial);
  const [notice, setNotice] = useState<string | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const canEdit = can(OrgPermission.PROFILE_MANAGE);
  const prepaid = organization.paymentTerms === PaymentTerms.PREPAID;

  return (
    <div>
      <PageHeader title="Company" description="Your trade account profile and the commercial terms agreed with Top Flow." />

      {notice && (
        <div className="mb-6">
          <Alert tone="success">{notice}</Alert>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="h-fit">
          <CardHeader title="Company profile" description={canEdit ? 'Shown on your quotations, orders and invoices.' : 'Only owners can edit the company profile.'} />
          {canEdit ? (
            <ProfileForm
              key={formVersion}
              organization={organization}
              onSaved={(updated, message) => {
                setOrganization(updated);
                setNotice(message);
                setFormVersion((v) => v + 1);
                // The organization name and status also live in the session (header, permissions).
                void refreshSession();
              }}
            />
          ) : (
            <DetailList>
              <DetailItem label="Company name">{organization.name}</DetailItem>
              <DetailItem label="Legal name">{organization.legalName}</DetailItem>
              <DetailItem label="Business type">{ORG_TYPE_LABELS[organization.type]}</DetailItem>
              <DetailItem label="Trade licence">{organization.tradeLicenseNumber}</DetailItem>
              <DetailItem label="VAT TRN">{organization.trn && <span className="font-mono">{organization.trn}</span>}</DetailItem>
              <DetailItem label="Email">{organization.email}</DetailItem>
              <DetailItem label="Phone">{organization.phoneNumber}</DetailItem>
            </DetailList>
          )}
        </Card>

        <Card className="h-fit">
          <CardHeader title="Commercial terms" description="Set by Top Flow after verification" />
          <DetailList>
            <DetailItem stacked label="Account status">
              <span className="inline-flex flex-wrap items-center gap-2">
                <OrgStatusBadge status={organization.status} />
                {organization.verifiedAt && <span className="text-slate-500">since {formatDate(organization.verifiedAt)}</span>}
              </span>
            </DetailItem>
            <DetailItem stacked label="Payment terms">{PAYMENT_TERMS_LABELS[organization.paymentTerms]}</DetailItem>
            <DetailItem stacked label="Credit limit">
              {prepaid ? <span className="text-slate-500">Not applicable — orders are paid in advance</span> : aed(organization.creditLimit)}
            </DetailItem>
            <DetailItem stacked label="Trade discount">{formatPercent(organization.discountRate)}</DetailItem>
            <DetailItem stacked label="Verified">
              {organization.verifiedAt ? formatDate(organization.verifiedAt) : <span className="text-slate-500">Not yet verified</span>}
            </DetailItem>
            {organization.memberCount !== undefined && <DetailItem stacked label="Team members">{organization.memberCount}</DetailItem>}
            <DetailItem stacked label="Customer since">{formatDate(organization.createdAt)}</DetailItem>
          </DetailList>
          <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
            To review your terms or credit limit, contact your Top Flow account manager.
          </p>
        </Card>
      </div>
    </div>
  );
}

export default function CompanyPage() {
  const { data, error, reload } = useApiQuery<OrganizationDto>('/org', { org: true });

  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!data) return <LoadingBlock label="Loading company profile…" />;
  return <CompanyView key={data.id} initial={data} />;
}
