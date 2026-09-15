'use client';

import { PASSWORD_MIN_LENGTH, ROLE_LABELS, Role, createStaffUserSchema, type UserAdminDto } from '@topflow/shared';
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

/** Unambiguous characters only (no 0/O, 1/l/I), so the password survives being read out. */
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function generatePassword(length = 16): string {
  const values = crypto.getRandomValues(new Uint32Array(length));
  let password = Array.from(values, (value) => PASSWORD_ALPHABET[value % PASSWORD_ALPHABET.length]).join('');
  // The password policy requires at least one letter and one number.
  if (!/\d/.test(password)) password = `${password.slice(0, -1)}7`;
  if (!/[A-Za-z]/.test(password)) password = `k${password.slice(1)}`;
  return password;
}

/** Administrators create staff accounts directly; the email address is treated as verified. */
export function StaffUserForm({ onCreated, onCancel }: { onCreated: (user: UserAdminDto) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<{ fullName: string; email: string; phoneNumber: string; role: StaffRole; password: string }>({
    fullName: '',
    email: '',
    phoneNumber: '',
    role: Role.SALES,
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
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

  const field = (key: 'fullName' | 'email' | 'phoneNumber', label: string, type: string, autoComplete: string, placeholder?: string) => (
    <Field label={label} htmlFor={`staff-${key}`} error={errors[key]}>
      <Input
        id={`staff-${key}`}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={draft[key]}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        aria-invalid={Boolean(errors[key])}
      />
    </Field>
  );

  return (
    <Card>
      <CardHeader title="Create staff account" description="The account can sign in straight away with the temporary password." />
      <form onSubmit={submit} noValidate className="grid gap-4 p-5 sm:grid-cols-2">
        {field('fullName', 'Full name', 'text', 'off')}
        {field('email', 'Work email', 'email', 'off', 'name@topflow.ae')}
        {field('phoneNumber', 'Mobile number (optional)', 'tel', 'off', '+971 50 123 4567')}
        <Field label="Role" htmlFor="staff-role" error={errors.role} hint={STAFF_ROLE_SUMMARIES[draft.role]}>
          <Select id="staff-role" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as StaffRole })}>
            {STAFF_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Temporary password"
          htmlFor="staff-password"
          error={errors.password}
          hint={`At least ${PASSWORD_MIN_LENGTH} characters with letters and numbers. Share it securely; they can choose their own with “Forgot password” on the sign-in page.`}
          className="sm:col-span-2"
        >
          <div className="flex flex-wrap gap-2">
            <Input
              id="staff-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              spellCheck={false}
              value={draft.password}
              onChange={(e) => setDraft({ ...draft, password: e.target.value })}
              aria-invalid={Boolean(errors.password)}
              className="min-w-0 flex-1 basis-56 font-mono"
            />
            <Button variant="secondary" aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? 'Hide' : 'Show'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setDraft({ ...draft, password: generatePassword() });
                setShowPassword(true);
              }}
            >
              Generate
            </Button>
          </div>
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
            Create account
          </Button>
        </div>
      </form>
    </Card>
  );
}
