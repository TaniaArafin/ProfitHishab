import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SEED_ORDER_REFS, makeSampleOrders } from '../../api/test/fixtures/make-sample-orders';
import { seedImportedOrders } from './db';

const PASSWORD = 'secret-pass-1';
let dir: string;
let sampleFile: string;

test.beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ph-import-'));
  sampleFile = path.join(dir, 'orders.xlsx');
  fs.writeFileSync(sampleFile, makeSampleOrders());
});
test.afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** SRS section 10 and 11.1: register → import the sample file → see profit. */
test('a new seller imports the sample file and sees their profit', async ({ page }, testInfo) => {
  const isPhone = testInfo.project.name === 'phone';
  const stamp = Date.now();
  const email = `e2e-import-${testInfo.project.name}-${stamp}@example.com`;
  const phone = `01${isPhone ? 8 : 7}${String(stamp).slice(-8)}`;
  const code = process.env.E2E_OTP_CODE ?? '123456'; // used only when the API has OTP_REQUIRED=true
  const overflow: Record<string, number> = {};
  const measure = async (name: string) => {
    if (!isPhone) return;
    overflow[name] = await horizontalOverflow(page);
    expect(overflow[name], `horizontal overflow on ${name}`).toBe(0);
  };

  await test.step('register and seed the three existing orders', async () => {
    await page.goto('/register');
    await page.getByLabel('Your name').fill('Import Person');
    await page.getByLabel('Business name').fill('E2E Import Shop');
    await page.getByLabel('Mobile number').fill(phone);
    const sendCode = page.getByRole('button', { name: 'Send code' });
    if (await sendCode.isVisible()) {
      await sendCode.click();
      await page.getByLabel('SMS code').fill(code);
    }
    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('heading', { name: /real profit/i })).toBeVisible();
    seedImportedOrders(email, [...SEED_ORDER_REFS]);
  });

  await test.step('upload the file', async () => {
    await page.goto('/imports/new');
    await measure('/imports/new');
    await page.getByLabel(/Your file/).setInputFiles(sampleFile);
    await page.getByRole('button', { name: 'Upload' }).click();
    await expect(page).toHaveURL(/\/imports\/[0-9a-f-]{36}$/);
  });

  await test.step('accept the suggested columns and statuses', async () => {
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Check my file' }).click();
  });

  await test.step('the preview counts the rows', async () => {
    await expect(page.getByText('237 rows detected: 225 valid, 8 duplicate, 4 invalid')).toBeVisible();
    await measure('/imports/[id] preview');
  });

  await test.step('import and open the profit', async () => {
    await page.getByRole('button', { name: 'Import 225 Orders' }).click();
    await expect(page.getByText('225 orders imported')).toBeVisible();
    await page.getByRole('link', { name: /See profit for/ }).click();
    await expect(page).toHaveURL(/\/dashboard\?from=2026-10-01&to=2026-10-31/);
    const statement = page.getByRole('region', { name: 'Profit statement' });
    await expect(statement.getByRole('link', { name: /^Sales/ })).toContainText('৳5,20,000');
  });

  await test.step('the import is in the history', async () => {
    await page.goto('/imports');
    await expect(page.getByText('225').locator('visible=true').first()).toBeVisible();
    await measure('/imports');
  });
});
