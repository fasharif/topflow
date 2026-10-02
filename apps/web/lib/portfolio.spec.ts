import { DEMO_BANNER_TEXT } from '@topflow/shared';
import type * as ReactModule from 'react';
import type * as ReactDomServer from 'react-dom/server';
import type * as DemoBannerModule from '@/components/demo-banner';
import type * as PortfolioNoticeModule from '@/components/portfolio-notice';
import nextConfig from '../next.config';
import robots from '../app/robots';
import { PORTFOLIO_NOTICE, ROBOTS_DIRECTIVE } from './portfolio';

/*
 * Every build of this portfolio project says what it is and stays out of search engines (ADR-023). A
 * demo build (ADR-021) says it with the demo banner instead of the portfolio notice: one of the two on
 * every page, never both. The robots meta tag, the X-Robots-Tag header and robots.txt must agree.
 */

/** React escapes apostrophes in text; compare against the text a visitor reads. */
function readable(html: string): string {
  return html.replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&');
}

/** Renders the notices at the top of a page, as a build with NEXT_PUBLIC_DEMO_MODE=`demoMode` would. */
function noticesOf(demoMode: boolean): string {
  const previous = process.env.NEXT_PUBLIC_DEMO_MODE;
  process.env.NEXT_PUBLIC_DEMO_MODE = String(demoMode);
  let html = '';
  jest.isolateModules(() => {
    const { createElement, Fragment } = jest.requireActual<typeof ReactModule>('react');
    const { renderToStaticMarkup } = jest.requireActual<typeof ReactDomServer>('react-dom/server');
    const { DemoBanner } = jest.requireActual<typeof DemoBannerModule>('@/components/demo-banner');
    const { PortfolioNotice } = jest.requireActual<typeof PortfolioNoticeModule>('@/components/portfolio-notice');
    html = renderToStaticMarkup(createElement(Fragment, null, createElement(DemoBanner), createElement(PortfolioNotice)));
  });
  process.env.NEXT_PUBLIC_DEMO_MODE = previous;
  return readable(html);
}

describe('portfolio notice', () => {
  it('names the author and says the site is not Top Flow’s store', () => {
    expect(PORTFOLIO_NOTICE).toContain('Portfolio project by Farah Sharif');
    expect(PORTFOLIO_NOTICE).toContain('not Top Flow’s official store');
  });

  it('opens every page of an ordinary build, without the demo banner', () => {
    const html = noticesOf(false);
    expect(html).toContain(PORTFOLIO_NOTICE);
    expect(html).not.toContain(DEMO_BANNER_TEXT);
    expect(html.match(/<aside /g)).toHaveLength(1);
  });

  it('gives way to the demo banner in a demo build, which says the same', () => {
    const html = noticesOf(true);
    expect(html).toContain(DEMO_BANNER_TEXT);
    expect(DEMO_BANNER_TEXT).toContain("not Top Flow's official store");
    expect(html).not.toContain(PORTFOLIO_NOTICE);
    expect(html.match(/<aside /g)).toHaveLength(1);
  });
});

describe('search engines', () => {
  it('are asked not to index or follow anything', () => {
    expect(ROBOTS_DIRECTIVE).toBe('noindex, nofollow');
  });

  it('get the same directive as the X-Robots-Tag header of every response', async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const everyPath = rules.find((rule) => rule.source === '/:path*');
    expect(everyPath?.headers).toContainEqual({ key: 'X-Robots-Tag', value: ROBOTS_DIRECTIVE });
  });

  it('may fetch every page, so they can read the noindex, and are offered no sitemap', () => {
    expect(robots()).toEqual({ rules: { userAgent: '*', allow: '/' } });
  });
});
