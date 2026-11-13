import { expect, test, type Page } from '@playwright/test';
import { endTrial, grantAdmin } from './db';

const PASSWORD = 'secret-pass-1';
const ENDED_COPY = 'Your free trial has ended. Your data is safe — pay to keep adding and changing orders.';

async function register(page: Page, email: string, phone: string, businessName: string) {
  // Used only when the API has OTP_REQUIRED=true (see first-profit.spec.ts).
  const code = process.env.E2E_OTP_CODE ?? '123456';
  await page.goto('/register');
  await page.getByLabel('Your name').fill('Test Person');
  await page.getByLabel('Business name').fill(businessName);
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
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** Trial ends → seller pays → admin confirms → seller can add a product again. */
test('a seller whose trial ended pays by bKash and is unlocked by an admin', async ({ browser }, testInfo) => {
  const project = testInfo.project.name;
  const isPhone = project === 'phone';
  const stamp = Date.now();
  const digit = isPhone ? 8 : 7;
  const sellerEmail = `e2e-pay-${project}-${stamp}@example.com`;
  const adminEmail = `e2e-admin-${project}-${stamp}@example.com`;
  const sellerPhone = `01${digit}${String(stamp).slice(-8)}`;
  const adminPhone = `01${digit === 8 ? 9 : 6}${String(stamp).slice(-8)}`;
  const senderNumber = `01${digit}${String(stamp + 1).slice(-8)}`;
  // 8-20 chars of A-Z/0-9, unique per run and per project.
  const trxId = `TRX${isPhone ? 'P' : 'D'}${stamp}`;

  const sellerCtx = await browser.newContext(testInfo.project.use);
  const adminCtx = await browser.newContext(testInfo.project.use);
  const seller = await sellerCtx.newPage();
  const admin = await adminCtx.newPage();

  try {
    await test.step('seller registers, then the trial ends', async () => {
      await register(seller, sellerEmail, sellerPhone, 'E2E Pay Shop');
      endTrial(sellerEmail);
      await seller.goto('/dashboard');
      await expect(seller.getByText(ENDED_COPY)).toBeVisible();
      if (isPhone) expect(await horizontalOverflow(seller)).toBe(0); // banner wraps on 360-412 px
    });

    await test.step('Pay now opens the billing page', async () => {
      await seller.getByRole('link', { name: 'Pay now' }).click();
      await expect(seller).toHaveURL(/\/billing$/);
      await expect(seller.getByText('Free trial ended')).toBeVisible();
      if (isPhone) expect(await horizontalOverflow(seller)).toBe(0);
    });

    await test.step('seller submits the payment', async () => {
      await seller.getByLabel('Your bKash/Nagad number').fill(senderNumber);
      await seller.getByLabel('Transaction ID (TrxID)').fill(trxId);
      await seller.getByRole('button', { name: 'I have paid' }).click();
      await expect(seller.getByText('Waiting for check').locator('visible=true').first()).toBeVisible();
      await expect(seller.getByText(trxId).locator('visible=true').first()).toBeVisible();
      if (isPhone) expect(await horizontalOverflow(seller)).toBe(0);
    });

    await test.step('an admin confirms it', async () => {
      await register(admin, adminEmail, adminPhone, 'E2E Admin Shop');
      grantAdmin(adminEmail);
      await admin.goto('/admin/payments');
      await expect(admin.getByRole('heading', { name: /payments/i }).first()).toBeVisible();
      if (isPhone) expect(await horizontalOverflow(admin)).toBe(0);
      const item = isPhone ? admin.getByRole('listitem').filter({ hasText: trxId }) : admin.getByRole('row').filter({ hasText: trxId });
      await item.getByRole('button', { name: 'Confirm', exact: true }).click();
      await admin.getByRole('button', { name: 'Confirm payment' }).click();
      await expect(admin.getByText(trxId)).toHaveCount(0); // gone from the pending tab
      await admin.goto('/admin/payments?status=confirmed');
      await expect(admin.getByText(trxId).locator('visible=true').first()).toBeVisible();
    });

    await test.step('the seller is unlocked and can add a product', async () => {
      await seller.goto('/dashboard');
      await expect(seller.getByText(ENDED_COPY)).toHaveCount(0);
      await expect(seller.getByRole('link', { name: 'Pay now' })).toHaveCount(0);
      await seller.goto('/products/new');
      await seller.getByLabel('Product name').fill('Paid Plan Saree');
      await seller.getByLabel('Selling price (৳)').fill('1200');
      await seller.getByLabel('Product cost (৳)').fill('700');
      await seller.getByRole('button', { name: 'Add product' }).click();
      await expect(seller.getByRole('link', { name: 'Paid Plan Saree', exact: true })).toBeVisible();
    });
  } finally {
    await sellerCtx.close();
    await adminCtx.close();
  }
});
