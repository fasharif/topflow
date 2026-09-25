import { formatMoney, type OrderDto } from '@topflow/shared';
import { PRODUCTS, productBySku } from '../support/data';
import { expect, test } from '../support/fixtures';
import { expectedRetailTotals } from '../support/money';
import { open } from '../support/page';

// Money path 1: a retail customer finds a product, buys three at the listed price and pays on
// delivery. The order must carry the catalogue price and the documented delivery and VAT rules.

test.describe('money path 1: retail checkout', () => {
  test('a customer buys from the catalogue and the server prices the order', async ({ actAs }) => {
    const { page, api } = await actAs('customer');
    const product = await productBySku(api, PRODUCTS.fitting);
    const quantity = 3;
    const expected = expectedRetailTotals([{ unitPrice: product.unitPrice, quantity }]);

    await test.step('find the product by its code', async () => {
      await open(page, `/products?search=${encodeURIComponent(product.sku)}`);
      await page.getByRole('heading', { name: product.name }).getByRole('link').click();
      await expect(page.getByRole('heading', { level: 1, name: product.name })).toBeVisible();
    });

    await test.step('add three to the basket', async () => {
      await page.getByRole('spinbutton', { name: 'Quantity' }).fill(String(quantity));
      await page.getByRole('button', { name: 'Add to basket' }).click();
      await expect(page.getByRole('status').filter({ hasText: `Added ${quantity}` })).toContainText('to your basket');
    });

    await test.step('review the basket', async () => {
      await open(page, '/cart');
      await expect(page.getByText(formatMoney(expected.totalAmount)).first()).toBeVisible();
      await page.getByRole('button', { name: 'Checkout at listed prices' }).click();
      await expect(page).toHaveURL(/\/checkout$/);
    });

    let orderId = '';
    await test.step('place the order to the saved home address, paying on delivery', async () => {
      await expect(page.getByRole('radio', { name: /Home/ })).toBeChecked();
      await page.getByRole('button', { name: 'Place order' }).click();
      await page.waitForURL(/\/account\/orders\/[^/?]+\?placed=1$/);
      orderId = new URL(page.url()).pathname.split('/').pop() ?? '';
      await expect(page.getByText("Order placed — we'll call you before delivery")).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toContainText(/TF-SO-\d{4}-\d{6}/);
      await expect(page.getByText('Confirmed', { exact: true }).first()).toBeVisible();
      await expect(page.getByText(formatMoney(expected.totalAmount)).first()).toBeVisible();
    });

    await test.step('the saved order carries the catalogue price, delivery and VAT', async () => {
      const order = await api.get<OrderDto>(`/me/orders/${orderId}`);
      expect(order).toMatchObject({
        channel: 'RETAIL',
        status: 'CONFIRMED',
        paymentMethod: 'CASH_ON_DELIVERY',
        paymentStatus: 'UNPAID',
        ...expected,
      });
      expect(order.items).toEqual([expect.objectContaining({ sku: product.sku, quantity, unitPrice: product.unitPrice })]);
    });

    await test.step('the basket is empty afterwards', async () => {
      await open(page, '/cart');
      await expect(page.getByText('Your basket is empty')).toBeVisible();
    });
  });
});
