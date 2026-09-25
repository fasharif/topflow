import { ForbiddenException } from '@nestjs/common';
import { DEMO_ORGANIZATION } from '@topflow/shared';
import { loadConfig } from '../config/env';
import { DemoPolicy } from './demo-policy';

const policy = (demo: Record<string, string> = {}) =>
  new DemoPolicy(
    loadConfig({ NODE_ENV: 'test', DATABASE_URL: 'postgres://test', ...demo }),
  );

function refusal(action: () => void): { status: number; code?: unknown } {
  try {
    action();
  } catch (error) {
    if (error instanceof ForbiddenException) {
      return {
        status: error.getStatus(),
        code: (error.getResponse() as { code?: unknown }).code,
      };
    }
    throw error;
  }
  throw new Error('Expected the demo policy to refuse the action');
}

describe('DemoPolicy', () => {
  it('allows everything outside demo mode', () => {
    const rules = policy();
    expect(rules.enabled).toBe(false);
    expect(() =>
      rules.assertMayInvite('staff', 'new.colleague@gmail.com'),
    ).not.toThrow();
    expect(() =>
      rules.assertMayChangeAccount('admin@topflow.example'),
    ).not.toThrow();
    expect(() =>
      rules.assertMayChangeOrganization(DEMO_ORGANIZATION.trn, 'review'),
    ).not.toThrow();
  });

  describe('in demo mode', () => {
    const rules = policy({
      DEMO_MODE: 'true',
      DEMO_MAIL_ALLOWLIST: 'farah@example.com',
    });

    it('refuses staff and customer invitations to addresses outside the allow-list', () => {
      for (const kind of ['staff', 'customer'] as const) {
        expect(
          refusal(() => rules.assertMayInvite(kind, 'stranger@gmail.com')),
        ).toEqual({ status: 403, code: 'DEMO_RESTRICTED' });
      }
      expect(() =>
        rules.assertMayInvite('staff', 'Farah@Example.com'),
      ).not.toThrow();
    });

    it('keeps the published demo accounts unchanged', () => {
      expect(
        refusal(() => rules.assertMayChangeAccount('sales@topflow.example')),
      ).toEqual({ status: 403, code: 'DEMO_RESTRICTED' });
      expect(() =>
        rules.assertMayChangeAccount('someone.else@e2e.topflow.test'),
      ).not.toThrow();
    });

    it('keeps the demo organisation’s KYC status, terms and identifiers', () => {
      for (const change of ['review', 'identifiers'] as const) {
        expect(
          refusal(() =>
            rules.assertMayChangeOrganization(DEMO_ORGANIZATION.trn, change),
          ),
        ).toEqual({ status: 403, code: 'DEMO_RESTRICTED' });
        expect(() =>
          rules.assertMayChangeOrganization('100998877600003', change),
        ).not.toThrow();
        expect(() =>
          rules.assertMayChangeOrganization(null, change),
        ).not.toThrow();
      }
    });
  });
});
