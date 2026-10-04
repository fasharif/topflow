import { webHealth } from './health';

describe('webHealth', () => {
  it('reports the running build so a deployment can be verified', () => {
    expect(webHealth({ APP_VERSION: 'sha-1a2b3c4' })).toMatchObject({ status: 'ok', version: 'sha-1a2b3c4' });
  });

  it('reports no version outside a container build', () => {
    const health = webHealth({});
    expect(health.version).toBeNull();
    expect(health.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});
