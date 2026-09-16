'use client';

import { ROLE_LABELS, Role, createStaffUserSchema, type UserAdminDto } from '@topflow/shared';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Card, CardHeader, Field, Input, Select } from '@/components/ui';
import { ApiError, api, errorMessage } from '@/lib/api';
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from '@/lib/forms';

const STAFF_ROLES = [Role.SALES, Role.WAREHOUSE, Role.ADMIN] as const;
type StaffRole = (typeof STAFF_ROLES)[number];

export const STAFF_ROLE_SUMMARIES: Record<StaffRole, string> = {
  SALES: 'Reviews organizations (KYC) and manages RFQs, quotations and orders.',
  WAREHOUSE: 'Maintains the catalog and stock levels, and fulfils orders.',
  ADMIN: 'Full access, including staff accounts and the audit trail.',
};

/**
 * Administrators invite colleagues by email. Supabase Auth sends the invitation; the colleague
 * chooses their own password, so no administrator ever sees or shares one.
 */
export function StaffUserForm({ onCreated, onCancel }: { onCreated: (user: UserAdminDto) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<{ fullName: string; email: string; phoneNumber: string; role: StaffRole }>({
    fullName: '',
    email: '',
    phoneNumber: '',
    role: Role.SALES,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const parsed = createStaffUserSchema.safeParse({ ...draft, phoneNumber: draft.phoneNumber.trim() || undefined });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      onCreated(await api<UserAdminDto>('/admin/users', { method: 'POST', body: parsed.data }));
    } catch (err) {
      const fieldErrors = apiFieldErrors(err);
      if (err instanceof ApiError && err.status === 409) fieldErrors.email = 'An account with this email address already exists';
      setErrors(fieldErrors);
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const field = (key: 'fullName' | 'email' | 'phoneNumber', label: string, type: string, placeholder?: string) => (
    <Field label={label} htmlFor={`staff-${key}`} error={errors[key]}>
      <Input
        id={`staff-${key}`}
        type={type}
        autoComplete="off"
        placeholder={placeholder}
        value={draft[key]}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        aria-invalid={Boolean(errors[key])}
      />
    </Field>
  );

  return (
    <Card>
      <CardHeader
        title="Invite a staff member"
        description="We email an invitation. They choose their own password, and back-office access asks them to set up two-factor authentication."
      />
      <form onSubmit={submit} noValidate className="grid gap-4 p-5 sm:grid-cols-2">
        {field('fullName', 'Full name', 'text')}
        {field('email', 'Work email', 'email', 'name@topflow.ae')}
        {field('phoneNumber', 'Mobile number (optional)', 'tel', '+971 50 123 4567')}
        <Field label="Role" htmlFor="staff-role" error={errors.role} hint={STAFF_ROLE_SUMMARIES[draft.role]}>
          <Select id="staff-role" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as StaffRole })}>
            {STAFF_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
        </Field>

        {error && (
          <div className="sm:col-span-2">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
          <Button variant="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Send invitation
          </Button>
        </div>
      </form>
    </Card>
  );
}
