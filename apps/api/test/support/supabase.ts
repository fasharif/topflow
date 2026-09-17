import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import type {
  AccountInvitation,
  IdentityRecord,
} from '../../src/auth/identity-admin.service';

export interface TestIdentity {
  id: string;
  email: string;
  aal?: 'aal1' | 'aal2';
  sessionId?: string;
  userMetadata?: Record<string, unknown>;
  /** Expiry as a Unix timestamp (seconds); one hour from now by default. */
  expiresAt?: number;
  issuer?: string;
  secret?: string;
}

/** Signs an access token shaped like Supabase Auth's (HS256, as the local Supabase stack issues). */
export function signAccessToken(identity: TestIdentity): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000) - 5;
  return new SignJWT({
    email: identity.email,
    role: 'authenticated',
    aal: identity.aal ?? 'aal1',
    session_id: identity.sessionId ?? randomUUID(),
    is_anonymous: false,
    user_metadata: identity.userMetadata ?? {},
    app_metadata: { provider: 'email', providers: ['email'] },
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(identity.id)
    .setIssuer(identity.issuer ?? `${process.env.SUPABASE_URL}/auth/v1`)
    .setAudience('authenticated')
    .setIssuedAt(issuedAt)
    .setExpirationTime(identity.expiresAt ?? issuedAt + 3600)
    .sign(
      new TextEncoder().encode(
        identity.secret ?? process.env.SUPABASE_JWT_SECRET,
      ),
    );
}

/** In-memory stand-in for the Supabase Auth admin API used by IdentityAdminService. */
export class FakeIdentityAdmin {
  readonly isConfigured = true;
  readonly identities = new Map<string, IdentityRecord>();
  readonly invitations: AccountInvitation[] = [];
  readonly suspended = new Set<string>();

  findIdentity(userId: string): Promise<IdentityRecord | null> {
    return Promise.resolve(this.identities.get(userId) ?? null);
  }

  inviteStaff(invitation: AccountInvitation): Promise<string> {
    return this.invite(invitation);
  }

  inviteCustomer(invitation: AccountInvitation): Promise<string> {
    return this.invite(invitation);
  }

  setSuspended(userId: string, suspended: boolean): Promise<void> {
    if (suspended) this.suspended.add(userId);
    else this.suspended.delete(userId);
    return Promise.resolve();
  }

  deleteIdentity(userId: string): Promise<void> {
    this.identities.delete(userId);
    return Promise.resolve();
  }

  /** The identity invited with this email address, as its first sign-in would present it. */
  identityFor(email: string): IdentityRecord | undefined {
    return [...this.identities.values()].find(
      (identity) => identity.email === email,
    );
  }

  private invite(invitation: AccountInvitation): Promise<string> {
    const id = randomUUID();
    this.invitations.push(invitation);
    this.identities.set(id, {
      id,
      email: invitation.email,
      emailConfirmed: false,
      userMetadata: { full_name: invitation.fullName },
    });
    return Promise.resolve(id);
  }
}
