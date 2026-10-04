import { onVercel } from './vercel';

describe('Vercel detection', () => {
  it('is true only where Vercel sets VERCEL=1, so analytics scripts are not requested in containers', () => {
    expect(onVercel({ VERCEL: '1' })).toBe(true);
    expect(onVercel({})).toBe(false);
    expect(onVercel({ VERCEL: '' })).toBe(false);
  });
});
