import { expect, test, type Page } from '@playwright/test';

/**
 * Spec 2026-11-25 §5.4 and owner decision 2: a pharmacy receives stock in batches, an order takes the
 * batch that expires first, and expired stock is cleared from the product list.
 */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function receive(page: Page, batchNo: string, expiresOn: string, quantity: string, cost: string) {
  await page.getByRole('button', { name: 'Receive stock' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Batch no').fill(batchNo);
  await dialog.getByLabel('Expiry date').fill(expiresOn);
  await dialog.getByLabel('Quantity (strip)').fill(quantity);
  await dialog.getByLabel('Cost per strip (৳)').fill(cost);
  await dialog.getByRole('button', { name: 'Add stock' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(`text=${batchNo} >> visible=true`).first()).toBeVisible();
}

test('a pharmacy sells first-expiry-first and clears expired stock', async ({ page }, testInfo) => {
  const isPhone = testInfo.project.name === 'phone';
  const stamp = Date.now();
  const phone = `01${isPhone ? 8 : 7}${String(stamp).slice(-8)}`;

  await test.step('register as a Medical & pharmacy seller', async () => {
    await page.goto('/register');
    await page.getByLabel('Your name').fill('Pharma Person');
    await page.getByLabel('Business name').fill('E2E Pharmacy');
    await page.getByLabel('Mobile number').fill(phone);
    const sendCode = page.getByRole('button', { name: 'Send code' });
    if (await sendCode.isVisible()) {
      await sendCode.click();
      await page.getByLabel('SMS code').fill(process.env.E2E_OTP_CODE ?? '123456');
    }
    await page.getByLabel(/^Email/).fill(`e2e-batches-${testInfo.project.name}-${stamp}@example.com`);
    await page.getByLabel('Password', { exact: true }).fill('secret-pass-1');
    await page.getByLabel('Business type').click();
    await page.getByRole('option', { name: 'Medical & pharmacy' }).click();
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('heading', { name: /real profit/i })).toBeVisible();
    await page.waitForLoadState('networkidle');
  });

  await test.step('add Napa 500mg (tracks expiry by default) and receive two batches', async () => {
    await page.goto('/products/new');
    await page.getByLabel('Product name').fill('Napa 500mg');
    await expect(page.getByRole('checkbox', { name: 'Track expiry dates (batches)' })).toBeChecked();
    await page.getByLabel('Price per strip (৳)').fill('12');
    await page.getByLabel('Cost per strip (৳)').fill('9.5');
    await page.getByRole('button', { name: 'Add product' }).click();
    await page.getByRole('link', { name: 'Napa 500mg', exact: true }).first().click();
    await receive(page, 'NP2611', '2099-06-30', '200', '9.5');
    await receive(page, 'NP2604', '2098-12-31', '120', '9.2');
    if (isPhone) expect(await horizontalOverflow(page), 'horizontal overflow on the product page').toBe(0);
  });

  await test.step('an order for 150 strips takes NP2604 first: cost ৳1,389', async () => {
    await page.goto('/orders/new');
    await page.getByLabel('Phone', { exact: true }).fill('01712345678');
    await page.getByLabel('Name (new customer)').fill('Rahim');
    await page.getByRole('combobox', { name: 'Add product' }).fill('napa');
    await page.getByRole('option', { name: /Napa 500mg/ }).click();
    await page.getByLabel('Qty').fill('150');
    await page.getByRole('button', { name: 'Save order' }).click();
    await expect(page.getByRole('heading', { name: /Order #1001/ })).toBeVisible();
    await expect(page.locator('text=/From batch NP2604 ×120/ >> visible=true').first()).toBeVisible();
    await expect(page.locator('text=৳1,389 >> visible=true').first()).toBeVisible();
  });

  await test.step('an expired batch is flagged and cleared', async () => {
    await page.goto('/products');
    await page.getByRole('link', { name: 'Napa 500mg', exact: true }).first().click();
    await receive(page, 'NP2501', '2020-01-31', '10', '9');
    await page.goto('/products');
    await expect(page.locator('text=/Expired: 10 strip/ >> visible=true').first()).toBeVisible();
    await page.locator('button:has-text("Clear stock") >> visible=true').first().click();
    await page.getByRole('button', { name: 'Clear expired stock' }).click();
    await expect(page.locator('text=/Expired: 10 strip/ >> visible=true')).toHaveCount(0);
    await expect(page.locator('text=170 strip >> visible=true').first()).toBeVisible();
  });
});
