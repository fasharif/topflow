import { formatMoney, fromFils, toFils, type OrderDto, type Paginated, type OrderSummaryDto, type ProductDto } from '@topflow/shared';
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
      await expect(page.getByText(formatMoney(expected.totalAmount)).filter({ visible: true }).first()).toBeVisible();
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
      await expect(page.getByText(formatMoney(expected.totalAmount)).filter({ visible: true }).first()).toBeVisible();
    });

    await test.step('the tracker shows the order as confirmed, with delivery still to come (BUG-12)', async () => {
      const progress = page.getByRole('list', { name: 'Order progress' });
      await expect(progress.locator('[aria-current="step"]')).toHaveCount(1);
      await expect(progress.locator('[aria-current="step"]')).toContainText('Current step: Confirmed');
      await expect(progress.getByText('Upcoming: Delivered')).toHaveCount(1);
      await expect(progress.getByText(/Completed:/)).toHaveCount(0);
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

  test('a price changed while the customer is at checkout is charged only after they see it (BUG-02)', async ({ actAs }) => {
    const { page, api } = await actAs('customer');
    const admin = await actAs('admin');
    const product = await productBySku(api, PRODUCTS.pipeFitting);
    const original = product.unitPrice;
    const lowered = fromFils(toFils(original) - 800);
    const shown = expectedRetailTotals([{ unitPrice: original, quantity: 1 }]);
    const charged = expectedRetailTotals([{ unitPrice: lowered, quantity: 1 }]);
    const orderCount = async () => (await api.get<Paginated<OrderSummaryDto>>('/me/orders', { query: { pageSize: 1 } })).total;

    try {
      await test.step('the customer opens checkout at the current price', async () => {
        await open(page, `/products/${product.slug}`);
        await page.getByRole('button', { name: 'Add to basket' }).click();
        await expect(page.getByRole('status').filter({ hasText: 'Added 1' })).toBeVisible();
        await open(page, '/checkout');
        await expect(page.getByText(formatMoney(shown.totalAmount)).filter({ visible: true }).first()).toBeVisible();
      });

      await test.step('meanwhile the back office lowers the price by AED 8.00', async () => {
        await admin.api.json<ProductDto>('PATCH', `/admin/products/${product.id}`, { body: { unitPrice: lowered } });
      });

      const before = await orderCount();
      await test.step('placing the order is refused and the page shows the new total', async () => {
        await page.getByRole('button', { name: 'Place order' }).click();
        await expect(page.getByRole('alert').filter({ hasText: 'Prices have changed since you opened checkout' })).toContainText(
          formatMoney(charged.totalAmount),
        );
        await expect(page).toHaveURL(/\/checkout$/);
        await expect(page.getByText(formatMoney(charged.totalAmount)).filter({ visible: true }).first()).toBeVisible();
        expect(await orderCount(), 'no order was placed').toBe(before);
      });

      await test.step('placing it again charges the total now shown', async () => {
        await page.getByRole('button', { name: 'Place order' }).click();
        await page.waitForURL(/\/account\/orders\/[^/?]+\?placed=1$/);
        const orderId = new URL(page.url()).pathname.split('/').pop() ?? '';
        const order = await api.get<OrderDto>(`/me/orders/${orderId}`);
        expect(order).toMatchObject(charged);
      });
    } finally {
      await admin.api.json<ProductDto>('PATCH', `/admin/products/${product.id}`, { body: { unitPrice: original } });
    }
  });
});
