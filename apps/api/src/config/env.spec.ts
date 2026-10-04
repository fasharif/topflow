import { sentryOptions } from '../observability/sentry-config';
import { DEFAULT_APP_VERSION } from './app-version';
import { loadConfig } from './env';

const production = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://db',
  SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  SUPABASE_SECRET_KEY: `sb_secret_${'x'.repeat(32)}`,
  INTERNAL_API_SECRET: 'y'.repeat(48),
};

describe('loadConfig', () => {
  it('fails fast when the database is not configured', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  it('refuses to boot in production without Supabase credentials and the internal secret', () => {
    const bare = () =>
      loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://db' });
    expect(bare).toThrow(/SUPABASE_URL/);
    expect(bare).toThrow(/SUPABASE_SECRET_KEY/);
    expect(bare).toThrow(/INTERNAL_API_SECRET/);
    expect(() =>
      loadConfig({ ...production, INTERNAL_API_SECRET: 'short' }),
    ).toThrow(/INTERNAL_API_SECRET/);
    expect(() => loadConfig(production)).not.toThrow();
  });

  it('derives the token issuer and signing keys from the Supabase project URL', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgres://db',
      SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co/',
    });
    expect(config.auth).toEqual({
      issuer: 'https://abcdefghijklmnopqrst.supabase.co/auth/v1',
      audience: 'authenticated',
      jwksUrl:
        'https://abcdefghijklmnopqrst.supabase.co/auth/v1/.well-known/jwks.json',
      jwtSecret: undefined,
      staffMfaRequired: false,
    });
  });

  it('uses the local Supabase stack and API docs outside production', () => {
    const config = loadConfig({ DATABASE_URL: 'postgres://db' });
    expect(config.supabase.url).toBe('http://127.0.0.1:54321');
    expect(config.http.swaggerEnabled).toBe(true);
  });

  it('lets the release preflight reject a malformed Sentry DSN', () => {
    const base = { DATABASE_URL: 'postgres://db' };
    expect(() => loadConfig({ ...base, SENTRY_DSN: 'sentry' })).toThrow(
      /SENTRY_DSN/,
    );
    expect(() => loadConfig({ ...base, SENTRY_DSN: '' })).not.toThrow();
    expect(() =>
      loadConfig({
        ...base,
        SENTRY_DSN: 'https://key@o1.ingest.sentry.io/1',
      }),
    ).not.toThrow();
  });

  it('reports one release at /health and to Sentry, with or without APP_VERSION', () => {
    const base = {
      DATABASE_URL: 'postgres://db',
      SENTRY_DSN: 'https://key@o1.ingest.sentry.io/1',
    };
    expect(loadConfig(base).app.version).toBe(DEFAULT_APP_VERSION);
    expect(sentryOptions(base)?.release).toBe(DEFAULT_APP_VERSION);

    const tagged = { ...base, APP_VERSION: 'sha-1a2b3c4' };
    expect(loadConfig(tagged).app.version).toBe('sha-1a2b3c4');
    expect(sentryOptions(tagged)?.release).toBe('sha-1a2b3c4');
  });

  describe('demo mode', () => {
    const demo = {
      ...production,
      DEMO_MODE: 'true',
    };

    it('is off unless DEMO_MODE is set', () => {
      expect(loadConfig({ DATABASE_URL: 'postgres://db' }).demo).toEqual({
        enabled: false,
        mailAllowList: [],
      });
      expect(() =>
        loadConfig({ DATABASE_URL: 'postgres://db', DEMO_MODE: 'yes' }),
      ).toThrow(/must be "true" or "false" \(got "yes"\)\n.*at DEMO_MODE/);
    });

    it('reads DEMO_MODE exactly as the web app and the demo reset do', () => {
      const flag = (DEMO_MODE: string) =>
        loadConfig({ DATABASE_URL: 'postgres://db', DEMO_MODE }).demo.enabled;
      expect(flag('')).toBe(false);
      expect(flag('0')).toBe(false);
      expect(flag('TRUE')).toBe(true);
      expect(flag(' 1 ')).toBe(true);
    });

    it('boots a production build in demo mode and normalises the mail allow-list', () => {
      const config = loadConfig({
        ...demo,
        DEMO_MAIL_ALLOWLIST: ' Farah@Example.com , @portfolio.example ',
      });
      expect(config.demo).toEqual({
        enabled: true,
        mailAllowList: ['farah@example.com', '@portfolio.example'],
      });
    });

    it('rejects allow-list entries that are neither addresses nor domains', () => {
      expect(() =>
        loadConfig({ ...demo, DEMO_MAIL_ALLOWLIST: 'example.com' }),
      ).toThrow(/DEMO_MAIL_ALLOWLIST/);
      expect(() =>
        loadConfig({ ...demo, DEMO_MAIL_ALLOWLIST: 'farah@' }),
      ).toThrow(/DEMO_MAIL_ALLOWLIST/);
    });

    it('refuses a whole public mail domain, which would reopen the demo to any address on it', () => {
      for (const entry of ['@gmail.com', ' @Outlook.com ']) {
        expect(() =>
          loadConfig({
            ...demo,
            DEMO_MAIL_ALLOWLIST: `farah@portfolio.example,${entry}`,
          }),
        ).toThrow(/public mail domain.*list exact addresses instead/);
      }
      // An exact address on a public service is fine: it reaches one mailbox.
      expect(
        loadConfig({ ...demo, DEMO_MAIL_ALLOWLIST: 'Farah@Gmail.com' }).demo
          .mailAllowList,
      ).toEqual(['farah@gmail.com']);
    });

    it('refuses staff MFA, because the published staff accounts are shared', () => {
      expect(() => loadConfig({ ...demo, STAFF_MFA_REQUIRED: 'true' })).toThrow(
        /must be false in demo mode.*\n.*at STAFF_MFA_REQUIRED/,
      );
      expect(() =>
        loadConfig({ ...production, STAFF_MFA_REQUIRED: 'true' }),
      ).not.toThrow();
    });

    it('keeps rate limits at or below the production defaults', () => {
      expect(() => loadConfig({ ...demo, THROTTLE_LIMIT: '301' })).toThrow(
        /must not exceed 300 in demo mode.*\n.*at THROTTLE_LIMIT/,
      );
      expect(() => loadConfig({ ...demo, AUTH_THROTTLE_LIMIT: '11' })).toThrow(
        /must not exceed 10 in demo mode.*\n.*at AUTH_THROTTLE_LIMIT/,
      );
      const strict = loadConfig({
        ...demo,
        THROTTLE_LIMIT: '120',
        AUTH_THROTTLE_LIMIT: '5',
      });
      expect(strict.throttle).toMatchObject({ limit: 120, authLimit: 5 });
      // Outside demo mode the limits can be raised, e.g. for load tests.
      expect(
        loadConfig({ ...production, THROTTLE_LIMIT: '5000' }).throttle.limit,
      ).toBe(5000);
    });

    it('refuses a shorter rate-limit window, which would allow more requests', () => {
      expect(() => loadConfig({ ...demo, THROTTLE_TTL_MS: '1000' })).toThrow(
        /must be at least 60000 in demo mode.*\n.*at THROTTLE_TTL_MS/,
      );
      expect(
        loadConfig({ ...demo, THROTTLE_TTL_MS: '120000' }).throttle.ttlMs,
      ).toBe(120_000);
      expect(
        loadConfig({ ...production, THROTTLE_TTL_MS: '1000' }).throttle.ttlMs,
      ).toBe(1000);
    });
  });

  it('hides API docs in production and parses the CORS allowlist', () => {
    const config = loadConfig({
      ...production,
      STAFF_MFA_REQUIRED: 'true',
      CORS_ORIGINS: 'https://www.topflow.ae, https://topflow-hub.vercel.app',
    });
    expect(config.http.swaggerEnabled).toBe(false);
    expect(config.auth.staffMfaRequired).toBe(true);
    expect(config.http.corsOrigins).toEqual([
      'https://www.topflow.ae',
      'https://topflow-hub.vercel.app',
    ]);
  });
});
