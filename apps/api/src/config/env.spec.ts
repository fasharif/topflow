import { loadConfig } from './env';

describe('loadConfig', () => {
  it('fails fast when the database is not configured', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  it('refuses to boot in production without a strong JWT secret', () => {
    expect(() =>
      loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://db' }),
    ).toThrow(/JWT_SECRET/);
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://db',
        JWT_SECRET: 'short',
      }),
    ).toThrow(/JWT_SECRET/);
  });

  it('uses developer-friendly defaults outside production', () => {
    const config = loadConfig({ DATABASE_URL: 'postgres://db' });
    expect(config.auth.accessTokenTtlSeconds).toBe(900);
    expect(config.auth.cookieSecure).toBe(false);
    expect(config.http.swaggerEnabled).toBe(true);
  });

  it('hardens cookies and hides API docs in production', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://db',
      JWT_SECRET: 'x'.repeat(48),
      CORS_ORIGINS: 'https://www.topflow.ae, https://topflow.vercel.app',
    });
    expect(config.auth.cookieSecure).toBe(true);
    expect(config.http.swaggerEnabled).toBe(false);
    expect(config.http.corsOrigins).toEqual([
      'https://www.topflow.ae',
      'https://topflow.vercel.app',
    ]);
  });
});
