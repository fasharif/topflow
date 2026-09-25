import { configuredOrigin, publicOrigin } from './site';

describe('public origin behind a reverse proxy', () => {
  it('uses the configured site URL, which a container cannot learn from its own address', () => {
    expect(configuredOrigin('https://hub.example.com/')).toBe('https://hub.example.com');
    expect(publicOrigin('https://0.0.0.0:3000', configuredOrigin('https://localhost:8443'))).toBe('https://localhost:8443');
  });

  it('falls back to the request origin when no site URL is configured, as on Vercel previews', () => {
    expect(configuredOrigin(undefined)).toBeNull();
    expect(configuredOrigin('  ')).toBeNull();
    expect(configuredOrigin('not a url')).toBeNull();
    expect(publicOrigin('https://topflow-hub-git-branch.vercel.app', null)).toBe('https://topflow-hub-git-branch.vercel.app');
  });
});
