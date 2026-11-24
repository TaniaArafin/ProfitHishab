import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'secret-pass-1';
const NEW_PASSWORD = 'new-pass-456';

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** FR-AUTH-09 and SRS 9: the four settings pages, and changing the password from the account page. */
test('a seller changes their password in settings and logs in with it', async ({ page, browser }, testInfo) => {
  const isPhone = testInfo.project.name === 'phone';
  const stamp = Date.now();
  const email = `e2e-settings-${testInfo.project.name}-${stamp}@example.com`;
  // 016/019: prefixes no other spec uses, so parallel workers never collide on a number.
  const phone = `01${isPhone ? 9 : 6}${String(stamp).slice(-8)}`;
  const code = process.env.E2E_OTP_CODE ?? '123456';

  await test.step('register', async () => {
    await page.goto('/register');
    await page.getByLabel('Your name').fill('Settings Person');
    await page.getByLabel('Business name').fill('E2E Settings Shop');
    await page.getByLabel(/^Mobile number/).fill(phone);
    const sendCode = page.getByRole('button', { name: 'Send code' });
    if (await sendCode.isVisible()) {
      await sendCode.click();
      await page.getByLabel('SMS code').fill(code);
    }
    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('heading', { name: /real profit/i })).toBeVisible();
  });

  await test.step('every settings tab opens and fits a 360 px phone', async () => {
    if (isPhone) await page.setViewportSize({ width: 360, height: 780 });
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/settings\/business$/);
    for (const [tab, heading] of [
      ['Business', 'Business details'],
      ['Profit defaults', 'Order defaults'],
      ['Couriers', 'Couriers'],
      ['Account', 'Your account'],
    ] as const) {
      await page.getByRole('navigation', { name: 'Settings' }).getByRole('link', { name: tab }).click();
      await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
      if (isPhone) expect(await horizontalOverflow(page), `horizontal overflow on ${tab}`).toBe(0);
    }
  });

  await test.step('change the password', async () => {
    await page.getByLabel('Current password').fill(PASSWORD);
    await page.getByLabel('New password').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByRole('status')).toContainText('Password changed. Other devices were logged out.');
  });

  await test.step('a new device logs in with the new password, not the old one', async () => {
    const other = await browser.newPage();
    await other.goto('/login');
    await other.getByLabel('Email or phone').fill(email);
    await other.getByLabel('Password').fill(PASSWORD);
    await other.getByRole('button', { name: /log in/i }).click();
    await expect(other.getByText(/wrong/i)).toBeVisible();
    await other.getByLabel('Password').fill(NEW_PASSWORD);
    await other.getByRole('button', { name: /log in/i }).click();
    await expect(other).toHaveURL(/\/dashboard/);
    await other.close();
  });
});
