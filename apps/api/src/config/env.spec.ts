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

  it('accepts the current and the previous dispatch webhook secret, current first', () => {
    const off = loadConfig({ DATABASE_URL: 'postgres://db' });
    expect(off.integrations.dispatchWebhookSecrets).toEqual([]);
    expect(off.integrations.dispatchWebhookToleranceSeconds).toBe(300);

    const rotating = loadConfig({
      DATABASE_URL: 'postgres://db',
      DISPATCH_WEBHOOK_SECRET: 'n'.repeat(32),
      DISPATCH_WEBHOOK_SECRET_PREVIOUS: 'o'.repeat(32),
    });
    expect(rotating.integrations.dispatchWebhookSecrets).toEqual([
      'n'.repeat(32),
      'o'.repeat(32),
    ]);
    expect(() =>
      loadConfig({
        DATABASE_URL: 'postgres://db',
        DISPATCH_WEBHOOK_SECRET: 'short',
      }),
    ).toThrow(/DISPATCH_WEBHOOK_SECRET/);
  });
});
