import { DEMO_ACCOUNTS, DEMO_BANNER_TEXT, isDemoAccount, parseDemoModeFlag } from './demo';

describe('demo mode', () => {
  describe('parseDemoModeFlag', () => {
    it.each([
      ['true', true],
      ['TRUE', true],
      [' 1 ', true],
      ['false', false],
      ['0', false],
      ['', false],
      [undefined, false],
    ])('reads %p as %p', (value, expected) => {
      expect(parseDemoModeFlag(value)).toBe(expected);
    });

    it('refuses values that could silently switch the safeguards off', () => {
      expect(() => parseDemoModeFlag('yes')).toThrow('DEMO_MODE must be "true" or "false" (got "yes")');
      expect(() => parseDemoModeFlag('on', 'NEXT_PUBLIC_DEMO_MODE')).toThrow(/NEXT_PUBLIC_DEMO_MODE/);
    });
  });

  describe('published demo accounts', () => {
    it('lists each account once, in lower case', () => {
      const emails = DEMO_ACCOUNTS.map((account) => account.email);
      expect(new Set(emails).size).toBe(emails.length);
      for (const email of emails) expect(email).toBe(email.toLowerCase());
    });

    it('covers a buyer, an approver and every staff role', () => {
      const labels = DEMO_ACCOUNTS.map((account) => account.label).join(' | ');
      for (const role of ['buyer', 'approver', 'sales', 'warehouse', 'Administrator']) {
        expect(labels).toContain(role);
      }
    });

    it('recognises demo accounts regardless of case and spacing', () => {
      expect(isDemoAccount(' Admin@TopFlow.ae ')).toBe(true);
      expect(isDemoAccount('buyer@desertbloom.ae')).toBe(true);
      expect(isDemoAccount('owner@alwaha.ae')).toBe(false);
      expect(isDemoAccount('someone@example.com')).toBe(false);
    });
  });

  it('says plainly that the site is a portfolio demo, not Top Flow’s store', () => {
    expect(DEMO_BANNER_TEXT).toBe("Portfolio demo: data resets every night. This is not Top Flow's official store.");
  });
});
