import { PORTFOLIO_NOTICE, ROBOTS_DIRECTIVE } from './portfolio';

describe('portfolio notice', () => {
  it('names the author and says the site is not Top Flow’s store', () => {
    expect(PORTFOLIO_NOTICE).toContain('Portfolio project by Farah Sharif');
    expect(PORTFOLIO_NOTICE).toContain('not Top Flow’s official store');
  });

  it('keeps the site out of search results', () => {
    expect(ROBOTS_DIRECTIVE).toBe('noindex, nofollow');
  });
});
