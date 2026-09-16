'use client';

import {
  ORG_ROLE_LABELS,
  Permission,
  ROLE_LABELS,
  Role,
  adminUpdateUserSchema,
  type Paginated,
  type UserAdminDto,
} from '@topflow/shared';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { RequirePermission } from '@/components/admin-catalog/access';
import { ConfirmDialog } from '@/components/admin-catalog/confirm-dialog';
import { LoadError, ResultSummary, SearchForm, Switch } from '@/components/admin-catalog/list-controls';
import { useQueryState } from '@/components/admin-catalog/query-state';
import { STAFF_ROLE_SUMMARIES, StaffUserForm } from '@/components/admin-catalog/staff-user-form';
import { usePatchedItems } from '@/components/admin-catalog/use-patched-items';
import { Alert, Badge, Button, EmptyState, LoadingBlock, PageHeader, Pagination, Select, Table, Td, Th, cx } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useApiQuery } from '@/lib/use-api';

const ROLE_VALUES: readonly string[] = Object.values(Role);

type PendingChange = { user: UserAdminDto; kind: 'role'; role: Role } | { user: UserAdminDto; kind: 'deactivate' };

function roleSummary(role: Role): string {
  return role === Role.CUSTOMER ? 'Customers shop and use the trade portal, with no back-office access.' : STAFF_ROLE_SUMMARIES[role];
}

function UsersList() {
  const { get, page, update } = useQueryState();
  const search = get('search');
  const roleParam = get('role');
  const role = ROLE_VALUES.includes(roleParam) ? roleParam : '';
  const { user: me } = useSession();

  const { data, error, loading, reload } = useApiQuery<Paginated<UserAdminDto>>('/admin/users', { query: { page, search, role } });
  const [users, patch] = usePatchedItems(data?.items);
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filtered = Boolean(search || role);

  /** PATCH /admin/users/:id. Errors (e.g. changing your own role) propagate to the caller. */
  const save = async (user: UserAdminDto, change: { role?: Role; isActive?: boolean }) => {
    const parsed = adminUpdateUserSchema.safeParse(change);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Nothing to update');
    const updated = await api<UserAdminDto>(`/admin/users/${user.id}`, { method: 'PATCH', body: parsed.data });
    patch(updated);
    setActionError(null);
    reload();
    return updated;
  };

  const confirmPending = async (change: PendingChange) => {
    setNotice(null);
    if (change.kind === 'role') {
      const updated = await save(change.user, { role: change.role });
      setNotice(`${updated.fullName} is now ${ROLE_LABELS[updated.role]}. The new permissions apply immediately.`);
    } else {
      const updated = await save(change.user, { isActive: false });
      setNotice(`${updated.fullName}'s account is suspended and can no longer sign in.`);
    }
  };

  const reactivate = async (user: UserAdminDto) => {
    setSavingId(user.id);
    setNotice(null);
    setActionError(null);
    try {
      const updated = await save(user, { isActive: true });
      setNotice(`${updated.fullName}'s account is active again.`);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setSavingId(null);
    }
  };

  let content;
  if (!data) {
    content = error ? null : <LoadingBlock label="Loading users…" />;
  } else if (users.length === 0 && data.total > 0) {
    content = (
      <EmptyState
        title="This page is empty"
        description={`There are only ${data.totalPages} page${data.totalPages === 1 ? '' : 's'} of results.`}
        action={
          <Button variant="secondary" onClick={() => update({ page: 1 })}>
            Go to the first page
          </Button>
        }
      />
    );
  } else if (users.length === 0) {
    content = (
      <EmptyState
        title={filtered ? 'No users match these filters' : 'No users yet'}
        description={filtered ? 'Try another name or email address, or a different role.' : undefined}
        action={
          filtered ? (
            <Button variant="secondary" onClick={() => update({ search: null, role: null })}>
              Clear filters
            </Button>
          ) : undefined
        }
      />
    );
  } else {
    content = (
      <>
        <ResultSummary page={data.page} pageSize={data.pageSize} total={data.total} singular="user" loading={loading} />
        <div aria-busy={loading} className={loading ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Account</Th>
                <Th>Email verified</Th>
                <Th>Organizations</Th>
                <Th>Last sign-in</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isMe = me?.id === user.id;
                const busy = savingId === user.id;
                return (
                  <tr key={user.id} className={cx('transition hover:bg-slate-50/70', !user.isActive && 'bg-slate-50/60')}>
                    <Td className="min-w-44">
                      <div className={cx('flex items-center gap-2 font-medium', user.isActive ? 'text-ink-900' : 'text-slate-500')}>
                        {user.fullName}
                        {isMe && <Badge tone="brand">You</Badge>}
                      </div>
                      {user.phoneNumber && <p className="text-xs text-slate-500">{user.phoneNumber}</p>}
                    </Td>
                    <Td className="text-slate-600">
                      <a href={`mailto:${user.email}`} className="break-all hover:text-brand-700 hover:underline">
                        {user.email}
                      </a>
                    </Td>
                    <Td>
                      <label htmlFor={`role-${user.id}`} className="sr-only">
                        Role for {user.fullName}
                      </label>
                      <div className="w-40">
                        <Select
                          id={`role-${user.id}`}
                          value={user.role}
                          disabled={busy}
                          onChange={(e) => setPending({ user, kind: 'role', role: e.target.value as Role })}
                          className="h-9"
                        >
                          {Object.values(Role).map((value) => (
                            <option key={value} value={value}>
                              {ROLE_LABELS[value]}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={user.isActive}
                          disabled={busy}
                          label={`Account active: ${user.fullName}`}
                          onChange={(checked) => (checked ? reactivate(user) : setPending({ user, kind: 'deactivate' }))}
                        />
                        <span className={cx('text-xs', user.isActive ? 'text-success-700' : 'text-slate-500')}>{user.isActive ? 'Active' : 'Suspended'}</span>
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap">
                      {user.emailVerified ? (
                        <Badge tone="success">Verified</Badge>
                      ) : user.lastLoginAt ? (
                        <Badge tone="warning">Not verified</Badge>
                      ) : (
                        <Badge tone="info">Invitation sent</Badge>
                      )}
                    </Td>
                    <Td className="min-w-48">
                      {user.organizations.length === 0 ? (
                        <span className="text-slate-500">—</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {user.organizations.map((org) => (
                            <li key={org.id}>
                              <Link href={`/admin/organizations/${org.id}`} className="text-ink-900 hover:text-brand-700 hover:underline">
                                {org.name}
                              </Link>{' '}
                              <span className="text-xs text-slate-500">· {ORG_ROLE_LABELS[org.role]}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-slate-600">{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : <span className="text-slate-500">Never</span>}</Td>
                    <Td className="whitespace-nowrap text-slate-600">{formatDate(user.createdAt)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
        <Pagination page={data.page} totalPages={data.totalPages} onPage={(next) => update({ page: next })} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Users"
        description="Customer and staff accounts. Role changes apply immediately; suspending an account blocks sign-in everywhere."
        actions={
          !creating && (
            <Button
              onClick={() => {
                setNotice(null);
                setCreating(true);
              }}
            >
              Invite staff member
            </Button>
          )
        }
      />

      {creating && (
        <div className="mb-6">
          <StaffUserForm
            onCancel={() => setCreating(false)}
            onCreated={(user) => {
              setCreating(false);
              setNotice(`Invitation sent to ${user.email}. ${user.fullName} joins as ${ROLE_LABELS[user.role]} once they accept it.`);
              reload();
            }}
          />
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <SearchForm
          id="user-search"
          label="Search users"
          placeholder="Search by name or email"
          value={search}
          onSearch={(value) => update({ search: value })}
          className="w-full md:max-w-md"
        />
        <div>
          <label htmlFor="user-role-filter" className="sr-only">
            Filter by role
          </label>
          <Select id="user-role-filter" value={role} onChange={(e) => update({ role: e.target.value })} className="md:w-48">
            <option value="">All roles</option>
            {Object.values(Role).map((value) => (
              <option key={value} value={value}>
                {ROLE_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="space-y-4">
        {notice && <Alert tone="success">{notice}</Alert>}
        {actionError && <Alert tone="danger">{actionError}</Alert>}
        {error && <LoadError title="We couldn't load users" error={error} onRetry={reload} />}
      </div>
      <div className={cx((notice || actionError || error) && 'mt-4')}>{content}</div>

      {pending && (
        <ConfirmDialog
          title={pending.kind === 'role' ? `Change ${pending.user.fullName}'s role?` : `Suspend ${pending.user.fullName}?`}
          description={
            pending.kind === 'role' ? (
              <>
                <p>
                  From <strong className="text-ink-900">{ROLE_LABELS[pending.user.role]}</strong> to{' '}
                  <strong className="text-ink-900">{ROLE_LABELS[pending.role]}</strong>. {roleSummary(pending.role)}
                </p>
                <p>The new permissions apply to their next action, on every device.</p>
              </>
            ) : (
              <>
                <p>They lose access immediately and can&apos;t sign in until the account is reactivated.</p>
                {pending.user.organizations.length > 0 && (
                  <p>Their organization memberships are kept ({pending.user.organizations.map((org) => org.name).join(', ')}).</p>
                )}
              </>
            )
          }
          confirmLabel={pending.kind === 'role' ? 'Change role' : 'Suspend account'}
          tone={pending.kind === 'role' && pending.role !== Role.ADMIN ? 'primary' : 'danger'}
          onConfirm={() => confirmPending(pending)}
          onClose={() => setPending(null)}
        />
      )}
    </>
  );
}

export default function AdminUsersPage() {
  return (
    <RequirePermission permission={Permission.USERS_MANAGE} area="User management">
      <Suspense fallback={<LoadingBlock label="Loading users…" />}>
        <UsersList />
      </Suspense>
    </RequirePermission>
  );
}
