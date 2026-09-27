import { DEMO_BANNER_TEXT } from '@topflow/shared';
import type * as SiteMetadataModule from './site-metadata';

/*
 * Titles and link previews in and out of the portfolio demo (ADR-021). A preview card is often all
 * that someone sees of a shared link, so in a demo build every title and preview must say "portfolio
 * demo", and an ordinary build must not.
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

describe('site metadata', () => {
  it('names a demo build a portfolio demo in every title and preview', () => {
    const { siteMetadata, SITE_NAME } = load(true);
    const metadata = siteMetadata('https://demo.example');
    expect(SITE_NAME).toBe('TopFlow Hub portfolio demo');
    for (const text of visibleText(metadata)) expect(text).toMatch(/portfolio demo/i);
    expect((metadata.openGraph as { description: string }).description.startsWith(DEMO_BANNER_TEXT)).toBe(true);
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('leaves an ordinary build without any demo wording', () => {
    const { siteMetadata, SITE_NAME } = load(false);
    const metadata = siteMetadata('https://hub.example');
    expect(SITE_NAME).toBe('Top Flow Hub');
    for (const text of visibleText(metadata)) expect(text).not.toMatch(/demo/i);
    expect(metadata.robots).toBeUndefined();
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
