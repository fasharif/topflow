import { ForbiddenException, Global, Injectable, Module } from '@nestjs/common';
import { ErrorCode, isDemoAccount } from '@topflow/shared';
import { InjectConfig } from '../config/config.module';
import type { AppConfig } from '../config/env';
import { isAllowListed } from '../mail/mail-guard';

/** Who a Supabase invitation email would go to. */
export type InvitationKind = 'staff' | 'customer';

const INVITATION_REFUSALS: Record<InvitationKind, string> = {
  staff:
    'Staff invitations are switched off in the portfolio demo, because Supabase would email a real address. Sign in with one of the published demo accounts instead.',
  customer:
    'Customer invitations are switched off in the portfolio demo, because Supabase would email a real address. Link the request to an existing customer instead.',
};

/**
 * The public demo's rules for actions that reach outside the platform or could lock other visitors
 * out (ADR-021). Business email is guarded separately, in MailService. Outside demo mode every
 * check passes.
 */
@Injectable()
export class DemoPolicy {
  constructor(@InjectConfig() private readonly config: AppConfig) {}

  get enabled(): boolean {
    return this.config.demo.enabled;
  }

  /**
   * Supabase Auth sends invitation emails itself, so the mail guard cannot withhold them: in demo
   * mode an invitation is refused unless its address is on DEMO_MAIL_ALLOWLIST.
   */
  assertMayInvite(kind: InvitationKind, email: string): void {
    if (!this.enabled || isAllowListed(email, this.config.demo.mailAllowList)) {
      return;
    }
    throw new ForbiddenException({
      message: INVITATION_REFUSALS[kind],
      code: ErrorCode.DEMO_RESTRICTED,
    });
  }

  /** The published demo accounts stay usable by every visitor until the nightly reset. */
  assertMayChangeAccount(email: string): void {
    if (!this.enabled || !isDemoAccount(email)) return;
    throw new ForbiddenException({
      message: `${email} is one of the published demo accounts, so its role and access cannot be changed in the portfolio demo.`,
      code: ErrorCode.DEMO_RESTRICTED,
    });
  }
}

@Global()
@Module({ providers: [DemoPolicy], exports: [DemoPolicy] })
export class DemoModule {}
