import {
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { InjectConfig } from '../config/config.module';
import type { AppConfig } from '../config/env';

/** What the platform needs to know about a Supabase Auth identity. */
export interface IdentityRecord {
  id: string;
  email: string | null;
  emailConfirmed: boolean;
  userMetadata: Record<string, unknown>;
}

export interface StaffInvitation {
  email: string;
  fullName: string;
  phoneNumber?: string;
  /** Where the invitation link lands after Supabase verifies it. */
  redirectTo: string;
}

/** A ban long enough to act as a suspension until an administrator lifts it (100 years). */
const SUSPENSION_BAN_DURATION = '876000h';

/**
 * Server-side Supabase Auth administration with the project's secret key, which never leaves
 * the API: reading identities, inviting staff and suspending accounts. Without the key (local
 * development and tests) reads return nothing and writes that need Supabase are refused.
 */
@Injectable()
export class IdentityAdminService {
  private readonly logger = new Logger(IdentityAdminService.name);
  private readonly client: SupabaseClient | null;

  constructor(@InjectConfig() config: AppConfig) {
    this.client = config.supabase.secretKey
      ? createClient(config.supabase.url, config.supabase.secretKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false,
          },
        })
      : null;
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  /** The Supabase identity behind a platform account, or null when unknown or unavailable. */
  async findIdentity(userId: string): Promise<IdentityRecord | null> {
    if (!this.client) return null;
    const { data, error } = await this.client.auth.admin.getUserById(userId);
    if (error || !data.user) {
      if (error && error.status !== 404) {
        this.logger.warn(`Could not read identity ${userId}: ${error.message}`);
      }
      return null;
    }
    return {
      id: data.user.id,
      email: data.user.email ?? null,
      emailConfirmed: Boolean(data.user.email_confirmed_at),
      userMetadata: data.user.user_metadata ?? {},
    };
  }

  /** Emails a Supabase invitation (the colleague chooses their own password) and returns the identity id. */
  async inviteStaff(invitation: StaffInvitation): Promise<string> {
    const client = this.requireClient('Staff invitations');
    const { data, error } = await client.auth.admin.inviteUserByEmail(
      invitation.email,
      {
        data: {
          full_name: invitation.fullName,
          ...(invitation.phoneNumber && {
            phone_number: invitation.phoneNumber,
          }),
        },
        redirectTo: invitation.redirectTo,
      },
    );
    if (error || !data.user) {
      if (error?.code === 'email_exists' || error?.status === 422) {
        throw new ConflictException(
          'An account with this email address already exists. Change its role from the user list instead.',
        );
      }
      this.logger.error(
        `Supabase invitation for ${invitation.email} failed: ${error?.message ?? 'no user returned'}`,
      );
      throw new ServiceUnavailableException(
        'The invitation could not be sent. Please try again.',
      );
    }
    return data.user.id;
  }

  /** Suspends (or restores) sign-in for an identity so no new sessions can be created. */
  async setSuspended(userId: string, suspended: boolean): Promise<void> {
    if (!this.client) {
      this.logger.warn(
        `Supabase administration is not configured: the ${suspended ? 'suspension' : 'reactivation'} of ${userId} is enforced by the API only`,
      );
      return;
    }
    const { error } = await this.client.auth.admin.updateUserById(userId, {
      ban_duration: suspended ? SUSPENSION_BAN_DURATION : 'none',
    });
    if (error && error.status !== 404) {
      this.logger.error(
        `Could not update identity ${userId}: ${error.message}`,
      );
      throw new ServiceUnavailableException(
        'The account could not be updated in the identity provider. Please try again.',
      );
    }
  }

  /** Best-effort clean-up when a platform account could not be created for a new identity. */
  async deleteIdentity(userId: string): Promise<void> {
    if (!this.client) return;
    const { error } = await this.client.auth.admin.deleteUser(userId);
    if (error) {
      this.logger.error(
        `Could not remove identity ${userId}: ${error.message}`,
      );
    }
  }

  private requireClient(feature: string): SupabaseClient {
    if (!this.client) {
      throw new ServiceUnavailableException(
        `${feature} need SUPABASE_SECRET_KEY to be configured on the API.`,
      );
    }
    return this.client;
  }
}
