'use client';

import {
  ORG_ROLE_LABELS,
  ORG_STATUS_LABELS,
  ORG_TYPE_LABELS,
  OrgStatus,
  PAYMENT_TERMS_LABELS,
  Permission,
  type MemberDto,
  type OrganizationDto,
} from '@topflow/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { RequirePermission } from '@/components/admin-catalog/access';
import { ConfirmButton } from '@/components/admin-catalog/confirm-dialog';
import { formatPercent } from '@/components/admin-catalog/helpers';
import { LoadError } from '@/components/admin-catalog/list-controls';
import { OrganizationReviewForm } from '@/components/admin-catalog/organization-review-form';
import { OrgStatusBadge } from '@/components/status-badge';
import { Alert, Button, Card, CardHeader, EmptyState, LinkButton, LoadingBlock, PageHeader, Stat, Table, Td, Th, cx } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { aed, formatDate, formatDateTime, pluralize } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api';

interface OrganizationDetail {
  organization: OrganizationDto;
  members: MemberDto[];
}

function DetailRow({ label, value, mono, href }: { label: string; value: string | null; mono?: boolean; href?: string }) {
  let content: ReactNode = <span className="text-slate-400">Not provided</span>;
  if (value) {
    content = href ? (
      <a href={href} className="text-brand-700 hover:underline">
        {value}
      </a>
    ) : (
      value
    );
  }
  return (
    <div className="px-5 py-3 sm:grid sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className={cx('mt-1 text-sm break-words text-ink-900 sm:col-span-2 sm:mt-0', mono && value && 'font-mono')}>{content}</dd>
    </div>
  );
}

function reviewStatusPatch(id: string, status: OrgStatus): Promise<OrganizationDto> {
  return api<OrganizationDto>(`/admin/organizations/${id}/review`, { method: 'PATCH', body: { status } });
}

function OrganizationDetailView({ id }: { id: string }) {
  const { data, error, loading, reload } = useApiQuery<OrganizationDetail>(`/admin/organizations/${encodeURIComponent(id)}`);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);

  if (!data) {
    if (error && (error.status === 404 || error.status === 400)) {
      return (
        <EmptyState
          title="Organization not found"
          description="It may have been removed, or the link is incorrect."
          action={<LinkButton href="/admin/organizations">Back to organizations</LinkButton>}
        />
      );
    }
    if (error) return <LoadError title="We couldn't load this organization" error={error} onRetry={reload} />;
    return <LoadingBlock label="Loading organization…" />;
  }

  const { organization, members } = data;

  const activate = async () => {
    setNotice(null);
    setActionError(null);
    setActivating(true);
    try {
      const updated = await reviewStatusPatch(organization.id, OrgStatus.ACTIVE);
      setNotice(`${updated.name} is verified and active. Its members can now accept quotations and buy on the agreed terms.`);
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setActivating(false);
    }
  };

  const suspend = async () => {
    setNotice(null);
    setActionError(null);
    const updated = await reviewStatusPatch(organization.id, OrgStatus.SUSPENDED);
    setNotice(`${updated.name} is suspended. Its members can no longer use the trade portal.`);
    reload();
  };

  const onReviewSaved = (updated: OrganizationDto) => {
    setActionError(null);
    setNotice(
      `Saved. ${updated.name} is ${ORG_STATUS_LABELS[updated.status].toLowerCase()} on ${PAYMENT_TERMS_LABELS[updated.paymentTerms].toLowerCase()} terms, with a ${aed(updated.creditLimit)} credit limit and ${formatPercent(updated.discountRate)} trade discount.`,
    );
    reload();
  };

  const reviewKey = [organization.id, organization.status, organization.paymentTerms, organization.creditLimit, organization.discountRate].join(':');

  return (
    <div aria-busy={loading}>
      <PageHeader
        eyebrow={
          <Link href="/admin/organizations" className="hover:underline">
            ← Organizations
          </Link>
        }
        title={organization.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <OrgStatusBadge status={organization.status} />
            <span>
              {ORG_TYPE_LABELS[organization.type]} · Applied {formatDate(organization.createdAt)}
            </span>
          </span>
        }
        actions={
          <>
            {organization.status !== OrgStatus.ACTIVE && (
              <Button onClick={activate} loading={activating}>
                {organization.status === OrgStatus.SUSPENDED ? 'Reactivate' : 'Approve & activate'}
              </Button>
            )}
            {organization.status !== OrgStatus.SUSPENDED && (
              <ConfirmButton
                size="md"
                title={`Suspend ${organization.name}?`}
                description={
                  <>
                    <p>
                      All {pluralize(members.length, 'member')} will be blocked from the trade portal: no quotations, approvals or orders
                      until the account is reactivated.
                    </p>
                    <p>Existing orders and documents are kept.</p>
                  </>
                }
                confirmLabel="Suspend organization"
                onConfirm={suspend}
              >
                Suspend
              </ConfirmButton>
            )}
          </>
        }
      />

      <div className="space-y-4">
        {notice && <Alert tone="success">{notice}</Alert>}
        {actionError && <Alert tone="danger">{actionError}</Alert>}
        {error && <LoadError title="We couldn't refresh this organization" error={error} onRetry={reload} />}
        {organization.status === OrgStatus.PENDING_VERIFICATION && (
          <Alert tone="warning" title="Awaiting KYC review">
            Check the trade licence and VAT TRN against the documents supplied. Activating the account lets its members accept quotations and
            buy on the agreed payment terms.
          </Alert>
        )}
        {organization.status === OrgStatus.SUSPENDED && (
          <Alert tone="danger" title="This organization is suspended">
            Its members are blocked from the trade portal until the account is reactivated.
          </Alert>
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Payment terms" value={PAYMENT_TERMS_LABELS[organization.paymentTerms]} />
        <Stat label="Credit limit" value={aed(organization.creditLimit)} />
        <Stat label="Trade discount" value={formatPercent(organization.discountRate)} hint="off list prices" />
        <Stat label="Members" value={members.length} />
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Company details" description="As submitted by the organization owner." />
            <dl className="divide-y divide-slate-100">
              <DetailRow label="Trading name" value={organization.name} />
              <DetailRow label="Legal name" value={organization.legalName} />
              <DetailRow label="Business type" value={ORG_TYPE_LABELS[organization.type]} />
              <DetailRow label="Trade licence" value={organization.tradeLicenseNumber} mono />
              <DetailRow label="VAT TRN" value={organization.trn} mono />
              <DetailRow label="Email" value={organization.email} href={organization.email ? `mailto:${organization.email}` : undefined} />
              <DetailRow label="Phone" value={organization.phoneNumber} href={organization.phoneNumber ? `tel:${organization.phoneNumber.replace(/\s/g, '')}` : undefined} />
              <DetailRow label="Verified" value={organization.verifiedAt ? formatDateTime(organization.verifiedAt) : 'Not verified yet'} />
            </dl>
          </Card>

          <section aria-labelledby="members-heading">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 id="members-heading" className="text-base font-semibold text-ink-900">
                Members
              </h2>
              <p className="text-sm text-slate-500">Approval limits are managed by the organization&apos;s owners.</p>
            </div>
            {members.length === 0 ? (
              <EmptyState title="No members" description="Nobody has joined this organization yet." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Name</Th>
                    <Th>Email</Th>
                    <Th>Role</Th>
                    <Th className="text-right">Approval limit</Th>
                    <Th>Joined</Th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.id}>
                      <Td className="font-medium whitespace-nowrap text-ink-900">{member.fullName}</Td>
                      <Td className="text-slate-600">
                        <a href={`mailto:${member.email}`} className="hover:text-brand-700 hover:underline">
                          {member.email}
                        </a>
                      </Td>
                      <Td className="whitespace-nowrap">{ORG_ROLE_LABELS[member.role]}</Td>
                      <Td className="text-right whitespace-nowrap tabular-nums">
                        {member.approvalLimit === null ? <span className="text-slate-500">No limit</span> : aed(member.approvalLimit)}
                      </Td>
                      <Td className="whitespace-nowrap text-slate-600">{formatDate(member.createdAt)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </section>
        </div>

        <div className="lg:sticky lg:top-6">
          <OrganizationReviewForm key={reviewKey} organization={organization} onSaved={onReviewSaved} />
        </div>
      </div>
    </div>
  );
}

export default function AdminOrganizationPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequirePermission permission={Permission.ORGANIZATIONS_REVIEW} area="Organization review">
      <OrganizationDetailView key={id} id={id} />
    </RequirePermission>
  );
}
