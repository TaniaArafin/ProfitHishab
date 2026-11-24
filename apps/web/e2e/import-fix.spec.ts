import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** A wrong row shows its error in place, is corrected there, and is imported. */
test('a seller fixes a wrong row on the preview and imports it', async ({ page }, testInfo) => {
  const isPhone = testInfo.project.name === 'phone';
  const stamp = Date.now();
  const email = `e2e-fix-${testInfo.project.name}-${stamp}@example.com`;
  const phone = `01${isPhone ? 5 : 3}${String(stamp).slice(-8)}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ph-fix-'));
  const file = path.join(dir, 'orders.csv');
  fs.writeFileSync(
    file,
    [
      'Order ID,Order Date,Phone,Product,Qty,Price,Status',
      `F${stamp}-1,2026-10-05,01712345678,Saree,1,1000,Delivered`,
      `F${stamp}-2,2026-10-06,12345,Kurti,2,500,Delivered`,
    ].join('\n'),
  );

  await page.goto('/register');
  await page.getByLabel('Your name').fill('Fix Person');
  await page.getByLabel('Business name').fill('E2E Fix Shop');
  await page.getByLabel(/^Mobile number/).fill(phone);
  const sendCode = page.getByRole('button', { name: 'Send code' });
  if (await sendCode.isVisible()) {
    await sendCode.click();
    await page.getByLabel('SMS code').fill(process.env.E2E_OTP_CODE ?? '123456');
  }
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('secret-pass-1');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: /real profit/i })).toBeVisible();

  await page.goto('/imports');
  await page.getByRole('button', { name: 'Import orders' }).click();
  await expect(page.getByRole('dialog', { name: 'Import orders' })).toBeVisible();
  await page.getByLabel(/Your file/).setInputFiles(file);
  await page.getByRole('button', { name: 'Upload and review' }).click();

  await expect(page.getByRole('heading', { name: '1 row needs fixing' })).toBeVisible();
  // The wrong value is a box right in its row, with the error under it.
  const phoneBox = page.getByRole('textbox', { name: 'Phone, row 3' }).locator('visible=true').first();
  await expect(phoneBox).toHaveValue('12345');
  await expect(page.getByText('Phone “12345”: Enter a number like 017XXXXXXXX')).toBeVisible();
  if (isPhone) expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);

  await phoneBox.fill('01912345678');
  await phoneBox.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Row 3 fixed.' })).toBeVisible();
  // The row is now ready: nothing is marked wrong any more.
  await expect(page.getByText(/Enter a number like 017XXXXXXXX/)).toHaveCount(0);

  await page.getByRole('button', { name: 'Import 2 Orders' }).click();
  await expect(page.getByText('2 orders imported')).toBeVisible();
  await page.goto(`/orders?q=01912345678`);
  await expect(page.getByText('01912345678').locator('visible=true').first()).toBeVisible();
  fs.rmSync(dir, { recursive: true, force: true });
});
