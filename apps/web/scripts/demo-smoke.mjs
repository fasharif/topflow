// End-to-end check of a production build's promises (ADR-021, ADR-023): starts `next start` on the build
// in .next, requests real pages over HTTP and checks what a visitor, a search engine or a link preview
// receives: the notice at the top of the page, noindex, page titles and Open Graph cards, robots.txt, the
// demo notices and the note beside Top Flow's real contact details.
//
// Every build says that it is a portfolio project and asks not to be indexed. A demo build shows the demo
// banner, calls itself a portfolio demo and shows the demo notices; an ordinary build shows the portfolio
// notice instead and no demo traces. Never both notices on one page.
//
//   NEXT_PUBLIC_DEMO_MODE=true npm run build -w web && npm run test:demo -w web   (a demo build)
//   npm run build -w web && npm run test:demo -w web -- --off                     (an ordinary build)
//
// The API does not need to run: the pages checked here render without it. The sign-in page's list of
// demo accounts is rendered in the browser (the form reads the query string inside a Suspense boundary),
// so plain HTTP cannot see it and it is not checked here.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { DEMO_BANNER_TEXT } = require('@topflow/shared');

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXPECT_DEMO = !process.argv.includes('--off');
const PORT = process.env.DEMO_SMOKE_PORT ?? '3102';
const BASE = `http://127.0.0.1:${PORT}`;
const PAGES = ['/', '/products', '/contact', '/login', '/register', '/forgot-password'];

// The portfolio notice of an ordinary build (apps/web/lib/portfolio.ts) and the start of its link
// preview text (apps/web/lib/site-metadata.ts).
const PORTFOLIO_NOTICE = 'Portfolio project by Farah Sharif, built with Top Flow’s permission. This is not Top Flow’s official store.';
const PORTFOLIO_PREVIEW = 'A portfolio project by Farah Sharif, built with Top Flow’s permission';
// Sent with every response of every build (ROBOTS_DIRECTIVE in apps/web/lib/portfolio.ts).
const ROBOTS_DIRECTIVE = 'noindex, nofollow';

const failures = [];
let checks = 0;
function check(condition, description) {
  checks++;
  if (!condition) failures.push(description);
}

/** React escapes quotes and ampersands in text; compare against the text a visitor reads. */
function readable(html) {
  return html
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

async function waitUntilReady(server) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`next start exited with code ${server.exitCode}`);
    try {
      const response = await fetch(`${BASE}/robots.txt`);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`next start did not answer on ${BASE} within 60 seconds`);
}

async function page(path) {
  const response = await fetch(`${BASE}${path}`, { redirect: 'manual' });
  return {
    status: response.status,
    location: response.headers.get('location'),
    robotsHeader: response.headers.get('x-robots-tag'),
    html: readable(await response.text()),
  };
}

async function run() {
  for (const path of PAGES) {
    const { status, robotsHeader, html } = await page(path);
    check(status === 200, `${path} answers 200 (got ${status})`);
    check(html.includes(DEMO_BANNER_TEXT) === EXPECT_DEMO, `${path} ${EXPECT_DEMO ? 'shows' : 'does not show'} the demo banner`);
    check(
      html.includes(PORTFOLIO_NOTICE) === !EXPECT_DEMO,
      `${path} ${EXPECT_DEMO ? 'does not show the portfolio notice, which the demo banner replaces' : 'shows the portfolio notice'}`,
    );
    // Every build, demo or not, asks search engines not to index it, in the page and in the header.
    check(html.includes(`<meta name="robots" content="${ROBOTS_DIRECTIVE}"`), `${path} has the robots meta tag "${ROBOTS_DIRECTIVE}"`);
    check(robotsHeader === ROBOTS_DIRECTIVE, `${path} sends X-Robots-Tag "${ROBOTS_DIRECTIVE}" (got "${robotsHeader}")`);

    // A shared link is often seen only as a title or a preview card, without the banner.
    const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '';
    const previewTitle = /<meta property="og:title" content="([^"]*)"/.exec(html)?.[1] ?? '';
    const previewText = /<meta property="og:description" content="([^"]*)"/.exec(html)?.[1] ?? '';
    check(/portfolio demo/i.test(title) === EXPECT_DEMO, `${path}: the page title "${title}" ${EXPECT_DEMO ? 'says' : 'does not say'} "portfolio demo"`);
    check(
      /portfolio demo/i.test(previewTitle) === EXPECT_DEMO,
      `${path}: the link preview title "${previewTitle}" ${EXPECT_DEMO ? 'says' : 'does not say'} "portfolio demo"`,
    );
    check(
      previewText.startsWith(DEMO_BANNER_TEXT) === EXPECT_DEMO,
      `${path}: the link preview text ${EXPECT_DEMO ? 'starts' : 'does not start'} with the banner text`,
    );
    if (!EXPECT_DEMO) {
      check(previewText.startsWith(PORTFOLIO_PREVIEW), `${path}: the link preview text "${previewText}" says that the site is a portfolio project`);
    }
  }

  // Top Flow's real phone number and email appear on the contact page and in every footer.
  const contact = await page('/contact');
  const contactNotes = contact.html.split("These are Top Flow's real contact details.").length - 1;
  check(
    EXPECT_DEMO ? contactNotes >= 2 : contactNotes === 0,
    `the contact page ${EXPECT_DEMO ? 'says, on the page and in the footer,' : 'does not say'} that the demo does not reach Top Flow (found ${contactNotes})`,
  );

  // In both builds robots.txt blocks nothing, so crawlers can read the noindex, and offers no sitemap.
  const robots = await page('/robots.txt');
  check(/^Allow: \/$/m.test(robots.html), 'robots.txt allows the whole site, so crawlers can read its noindex');
  check(!/^Disallow:/im.test(robots.html), `robots.txt disallows nothing (got "${robots.html.trim()}")`);
  check(!/^Sitemap:/im.test(robots.html), 'robots.txt offers no sitemap');

  const register = await page('/register');
  check(
    register.html.includes('New accounts are switched off in the portfolio demo') === EXPECT_DEMO,
    `the registration page ${EXPECT_DEMO ? 'explains that sign-up is off' : 'offers sign-up'}`,
  );
  const forgot = await page('/forgot-password');
  check(
    forgot.html.includes('Password reset emails are switched off in the portfolio demo') === EXPECT_DEMO,
    `the password reset page ${EXPECT_DEMO ? 'explains that reset emails are off' : 'offers reset emails'}`,
  );

  // Without a session nobody can reach the password form.
  const formWithoutSession = await page('/auth/set-password');
  check(
    formWithoutSession.status === 307 && (formWithoutSession.location ?? '').includes('/forgot-password?expired=1'),
    `/auth/set-password without a session redirects to /forgot-password (got ${formWithoutSession.status} ${formWithoutSession.location})`,
  );
}

// A server left running on the port would answer instead of this build.
const occupied = await fetch(`${BASE}/robots.txt`).then(
  () => true,
  () => false,
);
if (occupied) {
  console.error(`Something already answers on ${BASE}. Stop it, or choose another port with DEMO_SMOKE_PORT.`);
  process.exit(1);
}

const server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-p', PORT, '-H', '127.0.0.1'], {
  cwd: WEB_ROOT,
  env: process.env,
  stdio: ['ignore', 'ignore', 'inherit'],
});

try {
  await waitUntilReady(server);
  await run();
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
} finally {
  server.kill();
}

const mode = EXPECT_DEMO ? 'demo build' : 'ordinary build';
if (failures.length > 0) {
  console.error(`Build smoke test failed (${mode}), ${failures.length} of ${checks} check(s):\n${failures.map((failure) => `  - ${failure}`).join('\n')}`);
  process.exit(1);
}
console.log(`Build smoke test passed (${mode}): ${checks} checks on ${PAGES.length} pages, robots.txt and /auth/set-password.`);
