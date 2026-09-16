'use server';

import type { AuthError } from '@supabase/supabase-js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  mfaCodeSchema,
  newPasswordSchema,
  registerBusinessSchema,
  registerSchema,
  type AssuranceLevel,
  type ChangePasswordInput,
  type LoginInput,
  type NewPasswordInput,
  type RegisterBusinessInput,
  type RegisterInput,
} from '@topflow/shared';
import { headers } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { safeNextPath } from './redirects';

/*
 * Authentication runs in Server Actions with Supabase Auth. Sessions are written to httpOnly
 * cookies on this server, so the browser never handles tokens. Every action validates its input
 * again with the shared schemas: client-side validation is only a convenience.
 */

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string; fieldErrors?: Record<string, string> };

export interface MfaStatus {
  enabled: boolean;
  factorId: string | null;
  assuranceLevel: AssuranceLevel | null;
}

type Issue = { path: readonly PropertyKey[]; message: string };

function invalid(issues: readonly Issue[]): { ok: false; error: string; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join('.');
    if (key && !(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return { ok: false, error: 'Please correct the highlighted fields.', fieldErrors };
}

function authErrorMessage(error: AuthError): string {
  switch (error.code) {
    case 'invalid_credentials':
      return 'Incorrect email or password.';
    case 'email_not_confirmed':
      return 'Please confirm your email address first. We sent you a link when you created your account.';
    case 'user_banned':
      return 'This account has been suspended. Please contact Top Flow.';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Too many attempts. Please wait a minute and try again.';
    case 'weak_password':
      return 'Choose a stronger password: at least 8 characters with letters and numbers.';
    case 'same_password':
      return 'The new password must be different from the current one.';
    case 'reauthentication_needed':
      return 'For your security, sign in again before changing your password.';
    case 'mfa_verification_failed':
      return 'That code is not valid. Check your authenticator app and try again.';
    case 'mfa_challenge_expired':
      return 'The verification took too long. Please enter a new code.';
    case 'otp_expired':
      return 'That link has expired. Please request a new one.';
    case 'session_not_found':
    case 'refresh_token_not_found':
      return 'Your session has ended. Please sign in again.';
    default:
      return error.message || 'Something went wrong. Please try again.';
  }
}

function failure(error: AuthError, field?: string): { ok: false; error: string; code?: string; fieldErrors?: Record<string, string> } {
  const message = authErrorMessage(error);
  return { ok: false, error: message, code: error.code, ...(field && { fieldErrors: { [field]: message } }) };
}

/** Public origin for links in emails: the configured site URL, or the origin of this request. */
async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, '');
  const requestHeaders = await headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host') ?? 'localhost:3002';
  const protocol = requestHeaders.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${protocol}://${host}`;
}

export async function signInWithPassword(input: LoginInput): Promise<ActionResult<{ mfaRequired: boolean }>> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return failure(error);

  // Accounts with an authenticator app finish signing in with a code (aal2).
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return { ok: true, data: { mfaRequired: data?.nextLevel === 'aal2' && data.currentLevel !== 'aal2' } };
}

export async function signUp(input: {
  accountType: 'personal' | 'business';
  details: RegisterInput | RegisterBusinessInput;
  next?: string;
}): Promise<ActionResult<{ email: string; needsConfirmation: boolean }>> {
  const parsed =
    input.accountType === 'business' ? registerBusinessSchema.safeParse(input.details) : registerSchema.safeParse(input.details);
  if (!parsed.success) return invalid(parsed.error.issues);

  const { email, password, fullName, phoneNumber } = parsed.data;
  const organization = 'organization' in parsed.data ? parsed.data.organization : undefined;
  const origin = await siteOrigin();
  const landing = safeNextPath(input.next, origin, input.accountType === 'business' ? '/business?welcome=1' : '/account?welcome=1');

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}${landing}`,
      // Read once by the API when it creates the platform account (and the pending organization).
      data: {
        full_name: fullName,
        ...(phoneNumber ? { phone_number: phoneNumber } : {}),
        ...(organization ? { organization } : {}),
      },
    },
  });
  if (error) return failure(error);
  // With email confirmation on, Supabase answers the same way for new and existing addresses.
  return { ok: true, data: { email, needsConfirmation: !data.session } };
}

export async function signOut(scope: 'local' | 'global' = 'local'): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope });
}

export async function resendConfirmation(input: { email: string }): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: parsed.data.email,
    options: { emailRedirectTo: `${await siteOrigin()}/account` },
  });
  // Unknown addresses are never revealed; only rate limits are reported.
  if (error?.code?.startsWith('over_')) return failure(error);
  return { ok: true, data: undefined };
}

export async function requestPasswordReset(input: { email: string }): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await siteOrigin()}/auth/set-password`,
  });
  if (error?.code?.startsWith('over_')) return failure(error);
  return { ok: true, data: undefined };
}

/** Sets the password after a recovery or invitation link (the link started a session). */
export async function setNewPassword(input: NewPasswordInput): Promise<ActionResult> {
  const parsed = newPasswordSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);

  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) {
    return { ok: false, error: 'This link has expired. Request a new password reset email.', code: 'session_missing' };
  }
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return failure(error, 'password');
  // A recovered password ends every other session.
  await supabase.auth.signOut({ scope: 'others' });
  return { ok: true, data: undefined };
}

export async function changePassword(input: ChangePasswordInput): Promise<ActionResult> {
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.newPassword,
    current_password: parsed.data.currentPassword,
  });
  if (error) {
    if (error.code === 'invalid_credentials' || /current password/i.test(error.message)) {
      const message = 'Your current password is incorrect';
      return { ok: false, error: `${message}.`, code: error.code, fieldErrors: { currentPassword: message } };
    }
    return failure(error, 'newPassword');
  }
  await supabase.auth.signOut({ scope: 'others' });
  return { ok: true, data: undefined };
}

export async function getMfaStatus(): Promise<MfaStatus> {
  const supabase = await createSupabaseServerClient();
  const [{ data: factors }, { data: assurance }] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  const verified = factors?.totp.find((factor) => factor.status === 'verified') ?? null;
  return {
    enabled: verified !== null,
    factorId: verified?.id ?? null,
    assuranceLevel: (assurance?.currentLevel as AssuranceLevel | null | undefined) ?? null,
  };
}

/** Starts enrolling an authenticator app: returns the QR code and the manual-entry secret. */
export async function startTotpEnrollment(): Promise<ActionResult<{ factorId: string; qrCode: string; secret: string }>> {
  const supabase = await createSupabaseServerClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  // Abandoned set-ups leave unverified factors behind; clear them so enrolment can start again.
  for (const factor of factors?.all ?? []) {
    if (factor.factor_type === 'totp' && factor.status === 'unverified') {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `Authenticator app (${new Date().toISOString().slice(0, 10)})`,
  });
  if (error) return failure(error);
  return { ok: true, data: { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret } };
}

/** Verifies a TOTP code: completes an enrolment (factorId given) or a sign-in challenge. */
export async function verifyTotp(input: { code: string; factorId?: string }): Promise<ActionResult> {
  const parsed = mfaCodeSchema.safeParse({ code: input.code });
  if (!parsed.success) return invalid(parsed.error.issues);

  const supabase = await createSupabaseServerClient();
  let factorId = input.factorId;
  if (!factorId) {
    const { data: factors } = await supabase.auth.mfa.listFactors();
    factorId = factors?.totp.find((factor) => factor.status === 'verified')?.id;
  }
  if (!factorId) return { ok: false, error: 'Set up an authenticator app first.' };

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: parsed.data.code });
  if (error) return failure(error, 'code');
  return { ok: true, data: undefined };
}

export async function removeTotp(input: { factorId: string }): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.mfa.unenroll({ factorId: input.factorId });
  if (error) return failure(error);
  return { ok: true, data: undefined };
}
