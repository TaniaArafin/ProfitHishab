import { expect, test } from '@playwright/test';

/**
 * SRS section 10: register → add a product → create a delivered order → see real profit.
 * Each run registers a fresh seller, so it never depends on existing data or login limits.
 */
test('a new seller sees their real profit after their first delivered order', async ({ page }, testInfo) => {
  const email = `e2e-${testInfo.project.name}-${Date.now()}@example.com`;
  // A fresh number per run and project (017… desktop, 018… phone), so each run gets its own free trial.
  const phone = `01${testInfo.project.name === 'phone' ? 8 : 7}${String(Date.now()).slice(-8)}`;
  // Used only when the API has OTP_REQUIRED=true: its OTP_FIXED_CODE (dev .env and CI); nothing is texted in tests.
  const code = process.env.E2E_OTP_CODE ?? '123456';

  await test.step('register', async () => {
    await page.goto('/register');
    await page.getByLabel('Your name').fill('Nusrat Jahan');
    await page.getByLabel('Business name').fill('E2E Fashion');
    await page.getByLabel('Mobile number').fill(phone);
    // The API decides (OTP_REQUIRED): with codes on, confirm the number first.
    const sendCode = page.getByRole('button', { name: 'Send code' });
    if (await sendCode.isVisible()) {
      await sendCode.click();
      await page.getByLabel('SMS code').fill(code);
    }
    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel('Password', { exact: true }).fill('secret-pass-1');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('heading', { name: /real profit/i })).toBeVisible();
  });

  await test.step('add a product with its cost', async () => {
    await page.goto('/products/new');
    await page.getByLabel('Product name').fill('Premium Cotton Saree');
    await page.getByLabel('Selling price (৳)').fill('2500');
    await page.getByLabel('Product cost (৳)').fill('1350');
    await expect(page.getByText('৳1,150')).toBeVisible(); // live margin preview
    await page.getByRole('button', { name: 'Add product' }).click();
    await expect(page.getByRole('link', { name: 'Premium Cotton Saree', exact: true })).toBeVisible();
  });

  await test.step('create a delivered order using the keyboard picker', async () => {
    await page.goto('/orders/new');
    await page.getByLabel('Phone', { exact: true }).fill('01712345678');
    await page.getByLabel('Name (new customer)').fill('Rahima Akter');
    const picker = page.getByRole('combobox', { name: 'Add product' });
    await picker.fill('saree');
    await expect(page.getByRole('option', { name: /Premium Cotton Saree/ })).toBeVisible();
    await picker.press('ArrowDown');
    await picker.press('Enter');
    await page.getByLabel('Qty').fill('2');
    await page.getByLabel('Status', { exact: true }).click();
    await page.getByRole('option', { name: 'Delivered' }).click();
    await page.getByLabel('Courier cost (৳)').fill('100');
    await page.getByLabel('Packaging (৳)').fill('0');
    await expect(page.getByText('৳2,200', { exact: true })).toBeVisible(); // estimated profit: 5000 − 2700 cost − 100 courier
    await page.getByRole('button', { name: 'Save order' }).click();
    await expect(page.getByRole('heading', { name: /Order #1001/ })).toBeVisible();
  });

  await test.step('the dashboard shows the real profit', async () => {
    await page.goto('/dashboard');
    const hero = page.getByRole('region', { name: 'Net profit' });
    await expect(hero.getByText('৳2,200', { exact: true })).toBeVisible(); // 5000 − 2700 cost − 100 courier
  });
});
