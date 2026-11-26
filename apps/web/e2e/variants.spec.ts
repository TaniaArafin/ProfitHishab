import { expect, test, type Page } from '@playwright/test';

/**
 * Spec 2026-11-25 §5.1 and §5.3: a clothing seller sells a kurti by size and colour from a saved
 * list; a grocery product is sold by the kilo.
 */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test('a clothing seller sells variants and a product by kg', async ({ page }, testInfo) => {
  const isPhone = testInfo.project.name === 'phone';
  const stamp = Date.now();
  const email = `e2e-variants-${testInfo.project.name}-${stamp}@example.com`;
  const phone = `01${isPhone ? 8 : 7}${String(stamp).slice(-8)}`;
  const code = process.env.E2E_OTP_CODE ?? '123456';

  await test.step('register as a Clothing & fashion seller', async () => {
    await page.goto('/register');
    await page.getByLabel('Your name').fill('Variant Person');
    await page.getByLabel('Business name').fill('E2E Kurti House');
    await page.getByLabel('Mobile number').fill(phone);
    const sendCode = page.getByRole('button', { name: 'Send code' });
    if (await sendCode.isVisible()) {
      await sendCode.click();
      await page.getByLabel('SMS code').fill(code);
    }
    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel('Password', { exact: true }).fill('secret-pass-1');
    await page.getByLabel('Business type').click();
    await page.getByRole('option', { name: 'Clothing & fashion' }).click();
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('heading', { name: /real profit/i })).toBeVisible();
    await page.waitForLoadState('networkidle'); // the dashboard settles before the next page.goto
  });

  await test.step('the saved lists are ready in Settings → Product options', async () => {
    await page.goto('/settings/options');
    await expect(page.getByText('S, M, L, XL, XXL')).toBeVisible();
  });

  await test.step('create Cotton Kurti from the saved Size list and a Red colour', async () => {
    await page.goto('/products/new');
    await page.getByLabel('Product name').fill('Cotton Kurti');
    await page.getByLabel('SKU').fill('KUR');
    await page.getByRole('button', { name: 'Use saved list Size' }).click();
    // Keep S and M only.
    for (const size of ['L', 'XL', 'XXL']) await page.getByRole('button', { name: `Remove ${size} from Size` }).click();
    await page.getByRole('button', { name: '+ Colour' }).click();
    const colour = page.getByLabel('Add a value to Colour');
    await colour.fill('Red');
    await colour.press('Enter');
    await expect(page.getByText('Variants (2)')).toBeVisible();
    await page.getByLabel('Price for all').fill('1250');
    await page.getByLabel('Cost for all').fill('700');
    await page.getByRole('button', { name: 'Apply' }).click();
    await page.getByLabel('Stock for S / Red').fill('10');
    await page.getByLabel('Stock for M / Red').fill('14');
    if (isPhone) expect(await horizontalOverflow(page), 'horizontal overflow on the product form').toBe(0);
    await page.getByRole('button', { name: 'Add product' }).click();
    await expect(page.getByRole('link', { name: 'Cotton Kurti', exact: true })).toBeVisible();
    await expect(page.getByText(/KUR · 2 variants/).first()).toBeAttached();
  });

  await test.step('order 2 × M / Red', async () => {
    await page.goto('/orders/new');
    await page.getByLabel('Phone', { exact: true }).fill('01712345678');
    await page.getByLabel('Name (new customer)').fill('Rahima Akter');
    await page.getByRole('combobox', { name: 'Add product' }).fill('kurti');
    await page.getByRole('option', { name: /M \/ Red/ }).click();
    await page.getByLabel('Qty').fill('2');
    await expect(page.locator('text=৳2,500 >> visible=true').first()).toBeVisible();
    await page.getByRole('button', { name: 'Save order' }).click();
    await expect(page.getByRole('heading', { name: /Order #1001/ })).toBeVisible();
    await expect(page.locator('text=M / Red >> visible=true').first()).toBeVisible();
  });

  await test.step('M / Red stock went from 14 to 12', async () => {
    await page.goto('/products');
    await page.getByRole('link', { name: 'Cotton Kurti', exact: true }).first().click();
    await expect(page.getByLabel('Stock for M / Red')).toHaveValue('12');
    await expect(page.getByLabel('Stock for S / Red')).toHaveValue('10');
  });

  await test.step('Miniket Rice by kg: 2.5 kg is ৳195', async () => {
    await page.goto('/products/new');
    await page.getByLabel('Product name').fill('Miniket Rice');
    await page.getByLabel('Sold by').click();
    await page.getByRole('option', { name: 'kg', exact: true }).click();
    await page.getByLabel('Price per kg (৳)').fill('78');
    await page.getByLabel('Cost per kg (৳)').fill('66');
    await page.getByLabel('Stock (kg)').fill('250');
    await page.getByRole('button', { name: 'Add product' }).click();
    await expect(page.getByRole('link', { name: 'Miniket Rice', exact: true })).toBeVisible();

    await page.goto('/orders/new');
    await page.getByLabel('Phone', { exact: true }).fill('01812345678');
    await page.getByLabel('Name (new customer)').fill('Karim');
    await page.getByRole('combobox', { name: 'Add product' }).fill('rice');
    await page.getByRole('option', { name: /Miniket Rice/ }).click();
    await page.getByLabel('Qty (kg)').fill('2.5');
    await expect(page.locator('text=৳195 >> visible=true').first()).toBeVisible();
    await page.getByRole('button', { name: 'Save order' }).click();
    await expect(page.getByRole('heading', { name: /Order #1002/ })).toBeVisible();
    await expect(page.locator('text=2.5 kg >> visible=true').first()).toBeVisible();
  });
});
