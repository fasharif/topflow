import { originOf, publicOrigin } from './site';

describe('public origin behind a reverse proxy', () => {
  it('uses the configured site URL, which a container cannot learn from its own address', () => {
    expect(originOf('https://hub.example.com/')).toBe('https://hub.example.com');
    expect(publicOrigin('https://0.0.0.0:3000', originOf('https://localhost:8443'))).toBe('https://localhost:8443');
  });

  it('falls back to the request origin when no site URL is configured, as on Vercel previews', () => {
    expect(originOf(undefined)).toBeNull();
    expect(originOf('  ')).toBeNull();
    expect(originOf('not a url')).toBeNull();
    expect(publicOrigin('https://topflow-hub-git-branch.vercel.app', null)).toBe('https://topflow-hub-git-branch.vercel.app');
  });
});
