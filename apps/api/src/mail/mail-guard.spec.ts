import { loadConfig } from '../config/env';
import { isAllowListed, mailRoute, maskEmail } from './mail-guard';
import { MailService } from './mail.service';

const message = (to: string) => ({
  to,
  subject: 'Quote request TF-RFQ-2026-000001 received',
  text: 'Thank you for your request.',
});

/** A production-like configuration that sends through Resend, as the hosted demo would. */
const resendConfig = (demo: Record<string, string>) =>
  loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://test',
    MAIL_TRANSPORT: 'resend',
    RESEND_API_KEY: 're_test_placeholder',
    ...demo,
  });

describe('demo mail guard', () => {
  describe('isAllowListed', () => {
    const allowList = ['farah@example.com', '@portfolio.example'];

    it('matches exact addresses and whole domains, ignoring case and spaces', () => {
      expect(isAllowListed('farah@example.com', allowList)).toBe(true);
      expect(isAllowListed(' Farah@Example.COM ', allowList)).toBe(true);
      expect(isAllowListed('reviewer@portfolio.example', allowList)).toBe(true);
    });

    it('does not stretch an entry to other addresses or subdomains', () => {
      expect(isAllowListed('someone@example.com', allowList)).toBe(false);
      expect(isAllowListed('farah@example.com.evil.test', allowList)).toBe(
        false,
      );
      expect(isAllowListed('x@mail.portfolio.example', allowList)).toBe(false);
      expect(isAllowListed('x@notportfolio.example', allowList)).toBe(false);
    });

    it('rejects malformed recipients and an empty allow-list', () => {
      expect(isAllowListed('@portfolio.example', allowList)).toBe(false);
      expect(isAllowListed('farah@', allowList)).toBe(false);
      expect(isAllowListed('farah@example.com', [])).toBe(false);
    });

    it('never matches a recipient that names more than one mailbox', () => {
      for (const recipient of [
        'victim@gmail.com,farah@portfolio.example',
        'victim@gmail.com; farah@portfolio.example',
        'victim@gmail.com farah@portfolio.example',
        'Victim <victim@gmail.com>, farah@portfolio.example',
        '"victim@gmail.com"@portfolio.example',
        'victim@gmail.com@portfolio.example',
        'victim\\@gmail.com@portfolio.example',
        'farah@portfolio.example\r\nBcc: victim@gmail.com',
      ]) {
        expect(isAllowListed(recipient, allowList)).toBe(false);
        expect(
          mailRoute({ enabled: true, mailAllowList: allowList }, recipient),
        ).toBe('withhold');
      }
    });
  });

  describe('mailRoute', () => {
    it('delivers everything outside demo mode', () => {
      expect(
        mailRoute({ enabled: false, mailAllowList: [] }, 'info@topflow.ae'),
      ).toBe('deliver');
    });

    it('withholds everything in demo mode except allow-listed recipients', () => {
      const demo = { enabled: true, mailAllowList: ['@portfolio.example'] };
      expect(mailRoute(demo, 'visitor@gmail.com')).toBe('withhold');
      // Top Flow's own inbox receives the sales notifications of a real deployment.
      expect(mailRoute(demo, 'info@topflow.ae')).toBe('withhold');
      expect(mailRoute(demo, 'reviewer@portfolio.example')).toBe('deliver');
    });
  });

  it('masks addresses in log lines', () => {
    expect(maskEmail('visitor@gmail.com')).toBe('vi***@gmail.com');
    expect(maskEmail('a@b.test')).toBe('a***@b.test');
    expect(maskEmail('not-an-address')).toBe('***');
  });

  describe('MailService', () => {
    let fetchSpy: jest.SpyInstance;

    beforeEach(() => {
      fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response('{"id":"test"}', { status: 200 }));
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    const recipientsSentToResend = () =>
      fetchSpy.mock.calls.map(([, init]) => {
        const body = JSON.parse((init as { body: string }).body) as {
          to: string[];
        };
        return body.to[0];
      });

    it('sends through Resend outside demo mode', async () => {
      const mail = new MailService(resendConfig({}));
      await mail.send(message('visitor@gmail.com'));
      expect(recipientsSentToResend()).toEqual(['visitor@gmail.com']);
      expect(mail.withheld).toBe(0);
    });

    it('never calls the mail provider for a withheld message in demo mode', async () => {
      const mail = new MailService(
        resendConfig({
          DEMO_MODE: 'true',
          DEMO_MAIL_ALLOWLIST: '@portfolio.example',
        }),
      );
      await mail.send(message('visitor@gmail.com'));
      await mail.send(message('info@topflow.ae'));
      await mail.send(message('reviewer@portfolio.example'));

      expect(recipientsSentToResend()).toEqual(['reviewer@portfolio.example']);
      expect(mail.withheld).toBe(2);
      // Outside production the message is still kept in memory for tests and local debugging.
      expect(mail.lastMessageTo('visitor@gmail.com')?.subject).toContain(
        'TF-RFQ-2026-000001',
      );
    });

    it('withholds every message in demo mode when no allow-list is set', async () => {
      const mail = new MailService(resendConfig({ DEMO_MODE: 'true' }));
      await mail.send(message('farah@example.com'));
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(mail.withheld).toBe(1);
    });
  });
});
