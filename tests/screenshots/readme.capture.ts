import { mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { AL_WAHA } from '../support/accounts';
import { SEEDED, organizationByName, organizationQuotationId, productBySku, staffOrderId } from '../support/data';
import { stack } from '../support/env';
import { expect, test } from '../support/fixtures';
import { open } from '../support/page';

// README screenshots from the demo data. Every page is opened as the demo user who would see it.
const SCREENSHOTS = path.join(__dirname, '..', '..', 'docs', 'screenshots');
const WALKTHROUGH = path.join(__dirname, '..', 'reports', 'walkthrough');
const SHOWCASE_SKU = 'AX-RB-RT-05';

test.beforeAll(() => {
  mkdirSync(SCREENSHOTS, { recursive: true });
  mkdirSync(WALKTHROUGH, { recursive: true });
});

const shot = (name: string) => ({ path: path.join(SCREENSHOTS, `${name}.png`), animations: 'disabled' as const });

test('storefront home page', async ({ actAs }) => {
  const { page } = await actAs('customer');
  await page.context().clearCookies();
  await open(page, '/');
  await page.screenshot(shot('storefront'));
});

test('product page with an approximate price range', async ({ actAs }) => {
  const { page, api } = await actAs('customer');
  const product = await productBySku(api, SHOWCASE_SKU);
  await open(page, `/products/${product.slug}`);
  await expect(page.getByRole('heading', { level: 1, name: product.name })).toBeVisible();
  await page.screenshot(shot('product'));
});

test('trade portal: a purchase waiting for the approver', async ({ actAs }) => {
  const { page, api } = await actAs('approver');
  const quotationId = await organizationQuotationId(api, await api.organizationId(), SEEDED.pendingApprovalQuotation);
  await open(page, `/business/quotations/${quotationId}`);
  await expect(page.getByText('Your approval is needed')).toBeVisible();
  await page.screenshot(shot('trade-approval'));
});

test('back office: KYC review of a new trade account', async ({ actAs }) => {
  const { page, api } = await actAs('sales');
  const organization = await organizationByName(api, AL_WAHA.name);
  await open(page, `/admin/organizations/${organization.id}`);
  await expect(page.getByText('Awaiting KYC review')).toBeVisible();
  await page.screenshot(shot('kyc-review'));
});

test('back office: order fulfilment for the warehouse', async ({ actAs }) => {
  const { page, api } = await actAs('warehouse');
  const orderId = await staffOrderId(api, SEEDED.tradeOrderInProgress);
  await open(page, `/admin/orders/${orderId}`);
  await expect(page.getByRole('button', { name: 'Mark as Dispatched' })).toBeVisible();
  await page.screenshot(shot('fulfilment'));
});

test('walkthrough video: a retail customer buys a rotor', async ({ browser, actAs }) => {
  const { api } = await actAs('customer');
  const product = await productBySku(api, SHOWCASE_SKU);
  const context = await browser.newContext({
    baseURL: stack.webUrl,
    storageState: path.join(__dirname, '..', '.auth', 'customer.json'),
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: WALKTHROUGH, size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();
  const pause = () => page.waitForTimeout(900);

  await open(page, '/');
  await pause();
  const search = page.getByRole('main').getByRole('searchbox', { name: 'Search the catalogue' });
  await search.fill('pop-up rotor');
  await search.press('Enter');
  await page.waitForURL(/\/products\?/);
  await pause();
  await page.getByRole('heading', { name: product.name }).getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1, name: product.name })).toBeVisible();
  await pause();
  await page.getByRole('spinbutton', { name: 'Quantity' }).fill('4');
  await page.getByRole('button', { name: 'Add to basket' }).click();
  await pause();
  await open(page, '/cart');
  await pause();
  await page.getByRole('button', { name: 'Checkout at listed prices' }).click();
  await expect(page.getByRole('button', { name: 'Place order' })).toBeVisible();
  await pause();
  await page.getByRole('button', { name: 'Place order' }).click();
  await expect(page.getByText("Order placed — we'll call you before delivery")).toBeVisible();
  await page.waitForTimeout(2_000);

  const video = page.video();
  await context.close();
  if (!video) throw new Error('No video was recorded');
  renameSync(await video.path(), path.join(WALKTHROUGH, 'walkthrough.webm'));
});
