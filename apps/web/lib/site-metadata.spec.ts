import { DEMO_BANNER_TEXT } from '@topflow/shared';
import type * as SiteMetadataModule from './site-metadata';

/*
 * Titles and link previews in and out of the portfolio demo (ADR-021, ADR-023). A preview card is often
 * all that someone sees of a shared link, so a demo build must say "portfolio demo" in every title and
 * preview, and an ordinary build must describe itself as a portfolio project without any demo wording.
 * Every build asks search engines not to index it.
 */

/** Loads the module as a build with NEXT_PUBLIC_DEMO_MODE set to `demoMode` (the flag is read once). */
function load(demoMode: boolean): typeof SiteMetadataModule {
  const previous = process.env.NEXT_PUBLIC_DEMO_MODE;
  process.env.NEXT_PUBLIC_DEMO_MODE = String(demoMode);
  let loaded: typeof SiteMetadataModule | undefined;
  jest.isolateModules(() => {
    loaded = jest.requireActual<typeof SiteMetadataModule>('./site-metadata');
  });
  process.env.NEXT_PUBLIC_DEMO_MODE = previous;
  if (!loaded) throw new Error('Could not load site-metadata');
  return loaded;
}

const PRODUCT = {
  name: 'Pop-up spray head 10 cm',
  sku: 'TST-SPRAY-10',
  description: 'Adjustable-arc spray head for small lawns.',
  imageUrl: '/catalog/tst-spray-10.png',
};

/** Every piece of text a search result or a preview card shows. */
function visibleText(metadata: ReturnType<typeof SiteMetadataModule.siteMetadata>): string[] {
  const title = metadata.title as { default: string; template: string };
  const openGraph = metadata.openGraph as { siteName: string; title: string; description: string };
  const twitter = metadata.twitter as { title: string; description: string };
  return [title.default, title.template, openGraph.siteName, openGraph.title, openGraph.description, twitter.title, twitter.description];
}

/** The descriptions a search result and the preview cards show. */
function descriptions(metadata: ReturnType<typeof SiteMetadataModule.siteMetadata>): string[] {
  const openGraph = metadata.openGraph as { description: string };
  const twitter = metadata.twitter as { description: string };
  return [metadata.description as string, openGraph.description, twitter.description];
}

describe('site metadata', () => {
  it('names a demo build a portfolio demo in every title and preview', () => {
    const { siteMetadata, SITE_NAME } = load(true);
    const metadata = siteMetadata('https://demo.example');
    expect(SITE_NAME).toBe('TopFlow Hub portfolio demo');
    expect(metadata.applicationName).toBe('TopFlow Hub portfolio demo');
    for (const text of visibleText(metadata)) expect(text).toMatch(/portfolio demo/i);
    for (const text of descriptions(metadata)) expect(text.startsWith(DEMO_BANNER_TEXT)).toBe(true);
  });

  it('describes an ordinary build as a portfolio project, not as Top Flow’s store, without demo wording', () => {
    const { siteMetadata, SITE_NAME } = load(false);
    const metadata = siteMetadata('https://hub.example');
    expect(SITE_NAME).toBe('Top Flow Hub');
    expect(metadata.applicationName).toBe('TopFlow Hub');
    for (const text of visibleText(metadata)) expect(text).not.toMatch(/demo/i);
    for (const text of descriptions(metadata)) {
      expect(text.startsWith('A portfolio project by Farah Sharif, built with Top Flow’s permission')).toBe(true);
      expect(text).toContain('Not Top Flow’s official store.');
    }
  });

  it('asks search engines not to index any build, demo or not', () => {
    for (const demoMode of [true, false]) {
      expect(load(demoMode).siteMetadata('https://hub.example').robots).toEqual({ index: false, follow: false });
    }
  });

  it('marks a product preview in a demo build', () => {
    const metadata = load(true).productMetadata(PRODUCT);
    const openGraph = metadata.openGraph as { siteName: string; title: string; description: string; images: unknown };
    expect(metadata.title).toBe(PRODUCT.name);
    expect(openGraph).toMatchObject({
      siteName: 'TopFlow Hub portfolio demo',
      title: 'Pop-up spray head 10 cm · TopFlow Hub portfolio demo',
      description: `${DEMO_BANNER_TEXT} ${PRODUCT.description}`,
      images: [{ url: PRODUCT.imageUrl, alt: PRODUCT.name }],
    });
    expect(metadata.twitter).toMatchObject({ title: openGraph.title, description: openGraph.description });
  });

  it('keeps an ordinary product preview about the product only', () => {
    const metadata = load(false).productMetadata({ ...PRODUCT, description: null, imageUrl: null });
    expect(metadata.openGraph).toMatchObject({ siteName: 'Top Flow Hub', title: PRODUCT.name, description: 'Pop-up spray head 10 cm — TST-SPRAY-10' });
    expect((metadata.openGraph as { images?: unknown }).images).toBeUndefined();
  });
});
