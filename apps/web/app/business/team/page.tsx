'use client';

import {
  ORG_ROLE_LABELS,
  OrgPermission,
  OrgRole,
  inviteMemberSchema,
  toFils,
  updateMemberSchema,
  type InvitationDto,
  type MemberDto,
} from '@topflow/shared';
import { useState, type FormEvent } from 'react';
import { ConfirmAction, LoadError } from '@/components/business/feedback';
import { useOrg } from '@/components/business/use-org';
import { Alert, Badge, Button, Card, CardHeader, Field, Input, LoadingBlock, PageHeader, Select, Table, Td, Th } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from '@/lib/forms';
import { aed, formatDate, pluralize } from '@/lib/format';
import { refreshSession } from '@/lib/session';
import { useApiQuery } from '@/lib/use-api';

const ROLE_OPTIONS: OrgRole[] = [OrgRole.BUYER, OrgRole.APPROVER, OrgRole.OWNER];

const ROLE_GUIDE: Record<OrgRole, string> = {
  BUYER: 'Requests quotations and accepts them within their purchasing limit. Larger purchases go to an approver.',
  APPROVER: 'Everything a buyer can do, plus approving colleagues’ purchases, cancelling orders and managing delivery sites.',
  OWNER: 'Everything, including team members, purchasing limits and the company profile.',
};

function toRole(value: string): OrgRole {
  return ROLE_OPTIONS.find((role) => role === value) ?? OrgRole.BUYER;
}

/** Same amount regardless of formatting ("5000" vs "5000.00"); unparseable input counts as a change so it gets validated. */
function sameLimit(a: string, b: string): boolean {
  const left = a.trim();
  const right = b.trim();
  if (left === '' || right === '') return left === right;
  try {
    return toFils(left) === toFils(right);
  } catch {
    return false;
  }
}

function limitLabel(member: Pick<MemberDto, 'approvalLimit' | 'role'>) {
  if (member.approvalLimit !== null) return aed(member.approvalLimit);
  return (
    <>
      No limit
      {member.role === OrgRole.BUYER && <span className="block text-xs text-slate-600">Every purchase needs approval</span>}
    </>
  );
}

function MemberRow({
  member,
  isSelf,
  canManage,
  onChanged,
}: {
  member: MemberDto;
  isSelf: boolean;
  canManage: boolean;
  onChanged: (message: string, affectsSelf: boolean) => void;
}) {
  const [role, setRole] = useState<OrgRole>(member.role);
  const [limit, setLimit] = useState(member.approvalLimit ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const dirty = role !== member.role || !sameLimit(limit, member.approvalLimit ?? '');

  const save = async () => {
    setError(null);
    const patch: { role?: OrgRole; approvalLimit?: string | null } = {};
    if (role !== member.role) patch.role = role;
    if (!sameLimit(limit, member.approvalLimit ?? '')) patch.approvalLimit = limit.trim() === '' ? null : limit.trim();
    const parsed = updateMemberSchema.safeParse(patch);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await api<MemberDto>(`/org/members/${member.id}`, { method: 'PATCH', org: true, body: parsed.data });
      onChanged(`${member.fullName}’s access was updated.`, isSelf);
    } catch (err) {
      setError(errorMessage(err));
      setErrors(apiFieldErrors(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setError(null);
    try {
      await api<void>(`/org/members/${member.id}`, { method: 'DELETE', org: true });
      onChanged(`${member.fullName} was removed from the organization.`, false);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    // Top-aligned so the role select and the limit input line up even when the limit hint wraps.
    <tr className="[&>td]:align-top">
      <Td>
        <p className="font-medium text-ink-900">
          {member.fullName}
          {isSelf && (
            <Badge tone="brand" className="ml-2">
              You
            </Badge>
          )}
        </p>
        <p className="text-xs text-slate-500">{member.email}</p>
      </Td>
      <Td>
        {canManage ? (
          <>
            <label htmlFor={`role-${member.id}`} className="sr-only">
              Role for {member.fullName}
            </label>
            <Select id={`role-${member.id}`} value={role} onChange={(e) => setRole(toRole(e.target.value))} className="w-36" aria-invalid={Boolean(errors.role)}>
              {ROLE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {ORG_ROLE_LABELS[option]}
                </option>
              ))}
            </Select>
          </>
        ) : (
          ORG_ROLE_LABELS[member.role]
        )}
      </Td>
      <Td>
        {canManage ? (
          <>
            <label htmlFor={`limit-${member.id}`} className="sr-only">
              Purchasing limit for {member.fullName} in AED (empty for no limit)
            </label>
            <Input
              id={`limit-${member.id}`}
              inputMode="decimal"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="No limit"
              className="w-36"
              aria-invalid={Boolean(errors.approvalLimit)}
            />
            {errors.approvalLimit ? (
              <p role="alert" className="mt-1 text-xs text-danger-600">
                {errors.approvalLimit}
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-600">AED, excl. VAT · empty = no limit</p>
            )}
          </>
        ) : (
          limitLabel(member)
        )}
      </Td>
      <Td className="whitespace-nowrap text-slate-500">{formatDate(member.createdAt)}</Td>
      {canManage && (
        <Td className="text-right">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {dirty && (
              <>
                <Button size="sm" loading={saving} onClick={() => void save()}>
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={saving}
                  onClick={() => {
                    setRole(member.role);
                    setLimit(member.approvalLimit ?? '');
                    setErrors({});
                    setError(null);
                  }}
                >
                  Undo
                </Button>
              </>
            )}
            {!dirty && !isSelf && <ConfirmAction label="Remove" confirmLabel="Remove" prompt={`Remove ${member.fullName.split(' ')[0]}?`} onConfirm={remove} />}
          </div>
          {error && (
            <p role="alert" className="mt-2 text-left text-xs text-danger-600 sm:text-right">
              {error}
            </p>
          )}
        </Td>
      )}
    </tr>
  );
}

function InviteCard({ organizationName, onInvited }: { organizationName: string; onInvited: (email: string) => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrgRole>(OrgRole.BUYER);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const parsed = inviteMemberSchema.safeParse({ email, role });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setSending(true);
    try {
      const invitation = await api<InvitationDto>('/org/invitations', { method: 'POST', org: true, body: parsed.data });
      setEmail('');
      setRole(OrgRole.BUYER);
      onInvited(invitation.email);
    } catch (err) {
      setError(errorMessage(err));
      setErrors(apiFieldErrors(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Invite a colleague" description={`They will receive an email link to join ${organizationName}.`} />
      <form onSubmit={submit} className="space-y-4 p-5" noValidate>
        <Field label="Work email" htmlFor="invite-email" error={errors.email}>
          <Input id="invite-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(errors.email)} />
        </Field>
        <Field label="Role" htmlFor="invite-role" error={errors.role} hint="Set a purchasing limit once they have joined.">
          <Select id="invite-role" value={role} onChange={(e) => setRole(toRole(e.target.value))}>
            {ROLE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {ORG_ROLE_LABELS[option]}
              </option>
            ))}
          </Select>
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" className="w-full" loading={sending}>
          Send invitation
        </Button>
      </form>
    </Card>
  );
}

function PendingInvitations({ onChanged }: { onChanged: (message: string) => void }) {
  const invitations = useApiQuery<InvitationDto[]>('/org/invitations', { org: true });
  const [error, setError] = useState<string | null>(null);

  const revoke = async (invitation: InvitationDto) => {
    setError(null);
    try {
      await api<void>(`/org/invitations/${invitation.id}`, { method: 'DELETE', org: true });
      onChanged(`The invitation to ${invitation.email} was revoked.`);
      invitations.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Card>
      <CardHeader title="Pending invitations" description={invitations.data ? pluralize(invitations.data.length, 'invitation') : undefined} />
      {error && (
        <div className="px-5 pt-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      {invitations.error ? (
        <div className="p-5">
          <LoadError error={invitations.error} onRetry={invitations.reload} />
        </div>
      ) : !invitations.data ? (
        <LoadingBlock label="Loading invitations…" />
      ) : invitations.data.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-600">No pending invitations.</p>
      ) : (
        <ul className="divide-y divide-slate-200">
          {invitations.data.map((invitation) => (
            <li key={invitation.id} className="space-y-2 px-5 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 break-all font-medium text-ink-900">{invitation.email}</span>
                <Badge>{ORG_ROLE_LABELS[invitation.role]}</Badge>
              </div>
              <p className="text-xs text-slate-500">
                {invitation.invitedBy ? `Invited by ${invitation.invitedBy} · ` : ''}sent {formatDate(invitation.createdAt)} · expires {formatDate(invitation.expiresAt)}
              </p>
              <ConfirmAction label="Revoke" confirmLabel="Revoke" prompt="Revoke this invitation?" onConfirm={() => revoke(invitation)} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function TeamPage() {
  const { user, membership, can } = useOrg();
  const canManage = can(OrgPermission.MEMBERS_MANAGE);
  const members = useApiQuery<MemberDto[]>('/org/members', { org: true });
  const [notice, setNotice] = useState<string | null>(null);
  const [invitesVersion, setInvitesVersion] = useState(0);

  if (!membership) return null;

  const memberChanged = (message: string, affectsSelf: boolean) => {
    setNotice(message);
    members.reload();
    // Your own role or limit changed: refresh the session so permissions in the UI follow.
    if (affectsSelf) void refreshSession();
  };

  return (
    <div>
      <PageHeader
        title="Team"
        description={
          members.data
            ? `${pluralize(members.data.length, 'member')} can buy on behalf of ${membership.organizationName}.`
            : `People who can buy on behalf of ${membership.organizationName}.`
        }
      />

      {notice && (
        <Alert tone="success" className="mb-6">
          {notice}
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {members.error ? (
            <LoadError error={members.error} onRetry={members.reload} />
          ) : !members.data ? (
            <LoadingBlock label="Loading team…" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Member</Th>
                  <Th>Role</Th>
                  <Th>Purchasing limit</Th>
                  <Th>Joined</Th>
                  {canManage && (
                    <Th>
                      <span className="sr-only">Actions</span>
                    </Th>
                  )}
                </tr>
              </thead>
              <tbody>
                {members.data.map((member) => (
                  <MemberRow
                    // Remount after a reload so the editable fields show the saved values.
                    key={`${member.id}:${member.role}:${member.approvalLimit ?? ''}`}
                    member={member}
                    isSelf={member.userId === user?.id}
                    canManage={canManage}
                    onChanged={memberChanged}
                  />
                ))}
              </tbody>
            </Table>
          )}

          <Card>
            <CardHeader title="Roles and approvals" />
            <div className="p-5">
              <dl className="grid gap-4 sm:grid-cols-3">
                {ROLE_OPTIONS.map((role) => (
                  <div key={role}>
                    <dt className="text-sm font-medium text-ink-900">{ORG_ROLE_LABELS[role]}</dt>
                    <dd className="mt-0.5 text-sm text-slate-600">{ROLE_GUIDE[role]}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-xs text-slate-600">
                Purchasing limits compare against a quotation&apos;s value excluding VAT. A buyer without a limit needs approval for every purchase; approvers
                and owners without a limit can buy and approve any amount. Nobody can approve their own purchase.
              </p>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          {canManage ? (
            <>
              <InviteCard
                organizationName={membership.organizationName}
                onInvited={(email) => {
                  setNotice(`Invitation sent to ${email}.`);
                  setInvitesVersion((v) => v + 1);
                }}
              />
              <PendingInvitations key={invitesVersion} onChanged={setNotice} />
            </>
          ) : (
            <Alert tone="info" title="Managed by owners">
              Only owners can invite colleagues, change roles or set purchasing limits.
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}
