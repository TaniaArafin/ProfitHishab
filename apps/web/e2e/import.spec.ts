import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as XLSX from 'xlsx';
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
    await page.getByRole('button', { name: 'Upload and review' }).click();
    await expect(page).toHaveURL(/\/imports\/[0-9a-f-]{36}$/);
  });

  await test.step('recognised columns and statuses go straight to the preview', async () => {
    await expect(page.getByText(/^Matched \d+ columns and 1 status$/)).toBeVisible();
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

  await test.step('the monthly profit report shows October and exports CSV (SRS 11.1 item 10)', async () => {
    await page.goto('/reports/monthly-profit?to=2026-10');
    await expect(page.getByRole('heading', { name: 'Monthly profit' })).toBeVisible();
    await expect(page.getByText('৳5,20,000').locator('visible=true').first()).toBeVisible();
    await measure('/reports/monthly-profit');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Export CSV' }).click()]);
    const csv = fs.readFileSync(await download.path(), 'utf8');
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('2026-10,520000.00');
  });

  await test.step('the same report downloads as an Excel workbook', async () => {
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Export Excel' }).click()]);
    expect(download.suggestedFilename()).toBe('monthly-profit-2026-10.xlsx');
    const book = XLSX.read(fs.readFileSync(await download.path()), { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets['Monthly profit'], { header: 1 });
    expect(rows.find((r) => r[0] === '2026-10')?.[3]).toBe(520000); // revenue, a number Excel can add up
  });

  await test.step('the expense report fits a phone', async () => {
    await page.goto('/reports/expenses?to=2026-10');
    await expect(page.getByRole('heading', { name: 'Expense report' })).toBeVisible();
    await measure('/reports/expenses');
  });
});
