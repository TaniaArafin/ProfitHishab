# Phase 1 sign-off, Phase 2 (Reports + CSV) and Phase 3 (Account settings) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close Phase 1 (verify import acceptance), ship the three reports with CSV export (FR-REP-01–04), and ship account settings, email-required sign-up, logo upload and the split settings routes (FR-AUTH-07 rule, FR-AUTH-09, FR-BIZ-01).

**Architecture:** Reports live in the existing `profit` module: a new `reports.repository.ts` (SQL grouped by month, read-only, covered by the ProfitRepository exception in CLAUDE.md), new `ProfitService` methods, a `reports.controller.ts` at `/reports/*` that returns JSON or a CSV `StreamableFile` built by pure functions in `reports.csv.ts` on top of `common/csv.ts`. Account changes go through `AuthService` and `AuthRepository`; the logo goes through `BusinessService` with a small `LogoStore` (disk) and `sharp` (resize to WebP). The web splits `/settings` into four server pages under a shared layout.

**Tech Stack:** NestJS, Prisma/PostgreSQL raw SQL, Zod (`@ph/shared`), `sharp` (new), Next.js App Router server components, shadcn/ui, Jest + supertest, Vitest, Playwright.

**Spec:** [SRS.md](../../../SRS.md) sections 5.1 (FR-AUTH-07, 09), 5.2 (FR-BIZ-01), 5.10 (FR-REP), 6.2, 8.2, 9, 11.1. Roadmap: [2026-11-06-profithishab-roadmap.md](2026-11-06-profithishab-roadmap.md) Phases 1–3. Rules: [CLAUDE.md](../../../CLAUDE.md).

## Global Constraints

- Run `npm run check` before finishing each task; `npm run test:e2e` when a user flow changes (Tasks 4, 7, 8).
- Never commit; the user commits. Ignore the "Commit" habit from the skill: end each task with a short summary of changed files instead.
- Money is integer poisha; dates `YYYY-MM-DD`, months `YYYY-MM`, both in the business timezone (`Asia/Dhaka`).
- Every Prisma call / raw SQL in a repository; `businessId` only from `@Auth()`; values through Prisma bindings, never string interpolation.
- Errors via named constructors (`AuthError.*`, `BusinessError.*`); the exception filter maps them.
- CSV: `toCsv()` from `apps/api/src/common/csv.ts` (UTF-8 BOM, CRLF, formula escaping). Amounts in CSV are taka with 2 decimals (`(poisha / 100).toFixed(2)`), never formatted with `৳` or commas, so Excel reads numbers.
- UI: `components/ui/*` only, colours from `lib/theme-colors.ts`, `SelectField` not `<select>`, works 360 px → 1920 px (Table from `md`, stacked cards below).
- New config goes in `apps/api/src/config.ts` + `apps/api/.env.example`.

## Review Focus

1. A month with no orders or expenses must still appear as a zero row; the monthly report always has exactly 12 rows, oldest first, and an order dated the last day of a month lands in that month. → Task 2 tests `fills empty months with zeros` and `puts 31 Oct in October and 1 Nov in November`.
2. A category name or product name starting with `=`, `+` or containing Bangla must survive CSV export (escaped, readable). → Task 3 test `escapes formula cells and keeps Bangla`.
3. Changing an email to the seller's own current email (any letter case) is not a 409; another user's email is. → Task 6 test `keeps own email without a conflict`.
4. After a password change the current session keeps working and every other session gets 401. → Task 6 test `revokes other sessions but keeps this one`.
5. A "logo" that is not an image, or an image with huge pixel dimensions in a small file, answers 415 and never crashes or exhausts memory. → Task 8 tests `rejects a text file named .png` and `rejects an image over the pixel limit`.

---

### Task 1: Phase 1 sign-off (verify import acceptance)

Phase 1 is built and committed. This task proves it still meets SRS 11.1 items 2–4 and marks it done.

**Files:**
- Modify: `docs/superpowers/plans/2026-11-06-profithishab-roadmap.md` (Phase 1 status line, status date)

- [ ] **Step 1:** Run `npm run check`. Expected: all green. If anything fails, stop and use superpowers:systematic-debugging before changing code.
- [ ] **Step 2:** Run `npx jest -c apps/api/test/jest-e2e.json imports` (or the e2e script in `apps/api/package.json` filtered to `imports`). Expected: the 237-row test reports 225 valid / 8 duplicate / 4 invalid, the re-upload test is all duplicates, undo removes exactly those orders, and `validates 5,000 rows quickly` passes.
- [ ] **Step 3:** Run `npm run test:e2e -- import.spec.ts`. Expected: register → import → dashboard shows `৳5,20,000` on desktop and phone projects.
- [ ] **Step 4:** In the roadmap, change Phase 1 to `**Status: done (verified 2026-11-14).**` and drop "The review and the owner's commit are all that remain."

---

### Task 2: Monthly profit report API (FR-REP-01)

**Files:**
- Modify: `packages/shared/src/dates.ts`, `packages/shared/src/types.ts`, `packages/shared/src/schemas.ts`, `packages/shared/src/shared.test.ts`
- Create: `apps/api/src/modules/profit/reports.repository.ts`, `apps/api/src/modules/profit/reports.controller.ts`, `apps/api/src/modules/profit/reports.csv.ts`, `apps/api/src/modules/profit/reports.csv.spec.ts`, `apps/api/test/reports.e2e-spec.ts`
- Modify: `apps/api/src/modules/profit/profit.service.ts`, `apps/api/src/modules/profit/profit.module.ts`, `apps/api/test/helpers.ts`

**Interfaces:**
- Produces (shared):
  - `lastTwelveMonths(toMonth: string): { period: Period; months: string[] }`: `months` are 12 `YYYY-MM` strings, oldest first, ending at `toMonth`; `period` runs from the 1st of the first month to the last day of `toMonth`.
  - `currentMonthIn(timezone: string, now?: Date): string`: `todayIn(...).slice(0, 7)`.
  - `reportMonthsQuerySchema = z.object({ to: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-10').optional(), format: z.enum(['json', 'csv']).default('json') })`
  - `interface MonthlyProfitRowDto { month: string; statement: ProfitStatement; kpis: ProfitKpis }`
  - `interface MonthlyProfitReportDto { months: MonthlyProfitRowDto[]; total: { statement: ProfitStatement; kpis: ProfitKpis } }`
- Produces (api):
  - `ReportsRepository.monthlyOrderAggregates(businessId, period): Promise<Map<string, OrderAggregates>>` keyed by `YYYY-MM`; one query, `GROUP BY date_trunc('month', "orderDate"), status`, same columns and status folding as `ProfitRepository.orderAggregates` (extract the row-to-aggregate folding into a shared private function, do not copy it).
  - `ReportsRepository.monthlyExpenseAggregates(businessId, period): Promise<Map<string, ExpenseAggregates>>`: one query, grouped by month and `ec.kind`.
  - `ProfitService.monthly(businessId: string, toMonth: string): Promise<MonthlyProfitReportDto>`: per month `computeStatement` + `computeKpis` (missing months use `EMPTY_ORDER_AGGREGATES` / `EMPTY_EXPENSE_AGGREGATES`); `total` from the existing `periodFigures(businessId, period)`.
  - `monthlyProfitCsv(report: MonthlyProfitReportDto): string`
  - `GET /v1/reports/monthly-profit?to=YYYY-MM&format=json|csv`: `to` defaults to `currentMonthIn(auth.timezone)`.
  - Test helper `importSampleOrders(client: Client): Promise<void>` in `test/helpers.ts`: moved from the upload → mapping → validate → commit sequence already in `test/imports.e2e-spec.ts` (that spec then calls the helper).

- [ ] **Step 1: Write failing shared tests** in `shared.test.ts`:

```ts
it('lastTwelveMonths ends at the given month and wraps the year', () => {
  const r = lastTwelveMonths('2026-02');
  expect(r.months[0]).toBe('2025-03');
  expect(r.months[11]).toBe('2026-02');
  expect(r.months).toHaveLength(12);
  expect(r.period).toEqual({ from: '2025-03-01', to: '2026-02-28' });
});
it('lastTwelveMonths knows leap years', () => {
  expect(lastTwelveMonths('2028-02').period.to).toBe('2028-02-29');
});
```

- [ ] **Step 2:** Run `npm test -w @ph/shared`. Expected: FAIL, `lastTwelveMonths` is not exported.
- [ ] **Step 3:** Implement `lastTwelveMonths`, `currentMonthIn`, the schema and the DTO types; export them from `packages/shared/src/index.ts`.
- [ ] **Step 4:** Run `npm test -w @ph/shared`. Expected: PASS.
- [ ] **Step 5: Write the failing CSV unit test** `reports.csv.spec.ts`:
  - `monthlyProfitCsv` starts with `﻿`, and its header row is exactly `Month,Product sales,Delivery income,Revenue,Product cost,Courier cost,Ads cost,Other expenses,Gross profit,Net profit,Margin %,Orders,Delivered,Returned,Return rate %`.
  - One line per month in order, then a final `Total` line; `52000000` poisha renders as `520000.00`; a negative net profit `-150000` renders as `-1500.00`.
- [ ] **Step 6:** Implement `monthlyProfitCsv` with `toCsv`. Run `npx jest apps/api/src/modules/profit/reports.csv.spec.ts`. Expected: PASS.
- [ ] **Step 7: Write the failing e2e tests** in `test/reports.e2e-spec.ts` (`describe('GET /reports/monthly-profit')`):
  - `401 without a session`.
  - `reproduces the SRS reference figures`: `importSampleOrders(seller)`, then `POST /expenses` ৳50,000 in category kind `ads` (Facebook Ads) and ৳15,000 in kind `other` (Rent), both dated `2026-10-15`; `GET /reports/monthly-profit?to=2026-10`. Expect `months` length 12, `months[11].month === '2026-10'`, `months[11].statement` has `revenue: 52000000`, `productCost: 30000000`, `courierCost: 3500000`, `adsCost: 5000000`, `otherExpenses: 1500000`, `netProfit: 12000000`, and `months[11].kpis.profitMargin === 23.1`.
  - `fills empty months with zeros`: `months[0]` (2025-11) has `revenue: 0, netProfit: 0`.
  - `puts 31 Oct in October and 1 Nov in November`: a fresh seller creates two delivered orders dated `2026-10-31` and `2026-11-01` (`POST /orders` with an `Idempotency-Key`); `?to=2026-11` puts one delivered order in each of the last two rows.
  - `excludes another business's orders`: a second seller's report for 2026-10 has revenue 0.
  - `payload shape`: `Object.keys(months[0])` is exactly `['month', 'statement', 'kpis']`.
  - `format=csv`: `content-type` matches `text/csv`, `content-disposition` contains `monthly-profit-2026-10.csv`, the body starts with `﻿` and contains `2026-10,520000.00`.
  - `422 for to=2026-13`.
- [ ] **Step 8:** Run the reports e2e spec. Expected: FAIL with 404 on `/v1/reports/monthly-profit`.
- [ ] **Step 9:** Implement `ReportsRepository`, `ProfitService.monthly` and `ReportsController.monthlyProfit`. For CSV, return `new StreamableFile(Buffer.from(csv, 'utf8'), { type: 'text/csv; charset=utf-8', disposition: 'attachment; filename="monthly-profit-<to>.csv"' })`, the same pattern as `imports.controller.ts` `rejectedCsv`. Register the controller and repository in `profit.module.ts`. Move the import sequence into `importSampleOrders` and make `imports.e2e-spec.ts` use it.
- [ ] **Step 10:** Run the reports and imports e2e specs. Expected: PASS. Then `npm run check`.

---

### Task 3: Expense report API (FR-REP-03) and product-profit CSV (FR-REP-02, 04)

**Files:**
- Modify: `packages/shared/src/types.ts`, `packages/shared/src/schemas.ts`, `apps/api/src/modules/profit/reports.repository.ts`, `apps/api/src/modules/profit/profit.service.ts`, `apps/api/src/modules/profit/reports.controller.ts`, `apps/api/src/modules/profit/reports.csv.ts`, `apps/api/src/modules/profit/reports.csv.spec.ts`, `apps/api/test/reports.e2e-spec.ts`

**Interfaces:**
- Consumes: `lastTwelveMonths`, `reportMonthsQuerySchema`, `ProfitService.products` (existing).
- Produces:
  - `interface ExpenseReportRowDto { categoryId: string; categoryName: string; kind: ExpenseKind; amounts: number[]; total: number }` (`amounts[i]` matches `months[i]`).
  - `interface ExpenseReportDto { months: string[]; rows: ExpenseReportRowDto[]; monthTotals: number[]; total: number }`. Rows are categories with a non-zero total in the 12 months, sorted by `total` descending then name.
  - `productReportQuerySchema = periodQuerySchema.extend({ format: z.enum(['json', 'csv']).default('json') })`
  - `ReportsRepository.expensesByCategoryMonth(businessId, period): Promise<Array<{ categoryId: string; categoryName: string; kind: string; month: string; amount: number }>>`: one query, `GROUP BY` category and month, sums cast `float8`.
  - `ProfitService.expenseReport(businessId: string, toMonth: string): Promise<ExpenseReportDto>`
  - `expenseReportCsv(report: ExpenseReportDto): string`: header `Category,Kind,<12 months as YYYY-MM>,Total`, then one line per row, then a `Total` line.
  - `productProfitCsv(report: ProductProfitReportDto): string`: header `Product,SKU,Units sold,Sales,Cost,Profit,Margin %,Units returned`.
  - `GET /v1/reports/expenses?to=&format=` and `GET /v1/reports/product-profit?period=|from=&to=&format=` (JSON returns the same `ProductProfitReportDto` as `/profit/products`). File names: `expenses-<to>.csv`, `product-profit-<from>-to-<to>.csv`.

- [ ] **Step 1: Write failing CSV unit tests:** `expenseReportCsv` header has 15 columns and month columns in order; `escapes formula cells and keeps Bangla`: a category named `=SUM(A1)` comes out as `'=SUM(A1)`, and a product `শাড়ি` comes out unchanged in `productProfitCsv`.
- [ ] **Step 2:** Run them. Expected: FAIL (not exported). Implement both functions. Run again. Expected: PASS.
- [ ] **Step 3: Write failing e2e tests** (`describe('GET /reports/expenses')`, `describe('GET /reports/product-profit')`):
  - Expenses: 401 anonymous. A seller with ৳50,000 Facebook Ads and ৳15,000 Rent in 2026-10 and ৳2,000 Rent in 2026-09: `?to=2026-10` gives `rows[0]` Facebook Ads, `amounts[11] === 5000000`; the Rent row has `amounts[10] === 200000`, `amounts[11] === 1500000`, `total === 1700000`; `monthTotals[11] === 6500000`; `total === 6700000`. Categories with no expenses (Salary) are absent. An expense dated `2025-10-31` (outside the window) is excluded. Another business's expenses are excluded. CSV body starts with the BOM and has `Facebook Ads,ads,`.
  - Product profit: 401 anonymous. After `importSampleOrders`, `?from=2026-10-01&to=2026-10-31&format=csv` has 1 header and 9 product lines, and the JSON `rows` equal those from `/profit/products` with the same query.
- [ ] **Step 4:** Run. Expected: FAIL (404). Implement the repository method, service method and two controller routes. Run. Expected: PASS. Then `npm run check`.

---

### Task 4: Reports pages and navigation (web)

**Files:**
- Create: `apps/web/app/(app)/reports/monthly-profit/page.tsx`, `apps/web/app/(app)/reports/expenses/page.tsx`, `apps/web/components/MonthPicker.tsx`, `apps/web/components/MonthPicker.test.tsx`, `apps/web/components/CsvExportButton.tsx`
- Modify: `apps/web/app/(app)/reports/products/page.tsx` (add the export button), `apps/web/components/AppShell.tsx` (a "Reports" nav group), `apps/web/e2e/import.spec.ts`

**Interfaces:**
- Consumes: `GET /reports/monthly-profit`, `GET /reports/expenses`, `GET /reports/product-profit` via `/api/...` (the Next proxy maps `/api/*` to `/v1/*`, as `/api/imports/template.xlsx` does).
- Produces:
  - `CsvExportButton({ href }: { href: string })`: a server-renderable `Button asChild variant="secondary"` wrapping `<a href={href} download>` labelled `Export CSV`, with a `Download` icon.
  - `MonthPicker({ value, basePath }: { value: string; basePath: string })`: a client leaf. A `SelectField` labelled `Up to month` listing the last 24 months (`YYYY-MM`, shown like `Oct 2026`); on change it calls `navigateFresh(router, `${basePath}?to=${month}`)`.

- [ ] **Step 1: Write the failing component test** `MonthPicker.test.tsx`: it renders a combobox named `Up to month` showing `Oct 2026` for `value="2026-10"`; choosing `Sep 2026` navigates to `/reports/expenses?to=2026-09` (mock `next/navigation`).
- [ ] **Step 2:** Run `npm test -w @ph/web -- MonthPicker`. Expected: FAIL. Implement it. Expected: PASS.
- [ ] **Step 3:** Build `/reports/monthly-profit` as a server component. It reads `to` from `searchParams` (passed through, so the API applies the default). `PageHeader` title `Monthly profit`, with `MonthPicker` and `CsvExportButton href="/api/reports/monthly-profit?to=…&format=csv"` as actions. From `md` up it's a `Table` with columns Month, Revenue, Product cost, Courier, Ads, Other, Net profit (`<Money tone>`, so it carries a sign), Margin; newest month first on screen, with a Total row. Below `md` it's stacked cards with the same figures. `EmptyState` when every month's `orders` is 0.
- [ ] **Step 4:** Build `/reports/expenses` the same way. Rows are categories, columns are the months, with a Total column and row. The table scrolls horizontally inside its card (`overflow-x-auto` on the card, never the page). Below `md`, one card per category listing its non-zero months.
- [ ] **Step 5:** Add `CsvExportButton` to `/reports/products`, with the current period query plus `&format=csv`, pointing at `/api/reports/product-profit`.
- [ ] **Step 6:** In `AppShell.tsx`, add a nav group titled `Reports` with `Product profit` (`/reports/products`, existing icon), `Monthly profit` (`/reports/monthly-profit`, `CalendarRange`) and `Expense report` (`/reports/expenses`, `Receipt`); remove `Product profit` from its current group.
- [ ] **Step 7:** Extend `apps/web/e2e/import.spec.ts`: after the import, open `/reports/monthly-profit?to=2026-10`, expect a row containing `৳5,20,000`, click `Export CSV`, read the download and expect it to start with `﻿` and contain `2026-10,520000.00`.
- [ ] **Step 8:** Run `npm run check` and `npm run test:e2e`. Expected: PASS on desktop and phone.

---

### Task 5: Email required at sign-up while there is no SMS gateway (FR-AUTH-07 rule)

**Files:**
- Modify: `apps/api/src/modules/auth/sms.sender.ts`, `apps/api/src/modules/auth/auth.service.ts`, `packages/shared/src/types.ts` (`SignupOptionsDto`), `apps/web/app/(auth)/register/RegisterForm.tsx` (+ its test if present), `apps/api/test/helpers.ts`, `apps/api/test/signup-free-mode.e2e-spec.ts`, every API spec that calls `registerSeller(app, null…)`

**Interfaces:**
- Produces:
  - `emailRequiredAtSignup(): boolean` in `sms.sender.ts`, returning `config().sms.driver === 'log'`: no real gateway means no SMS reset, so email is required (SRS FR-AUTH-07). Today that's always true; it turns false when Phase 8 adds a driver.
  - `SignupOptionsDto.emailRequired: boolean`, filled by `AuthService.signupOptions()`.
  - `AuthService.register` throws `AuthError.emailRequired()` when `emailRequiredAtSignup()` is true and `input.email` is missing, before any other check.
  - `registerSeller(app, email: string | null, …)`: when `email` is null it now registers with `seller-<phone>@test.local`.

- [ ] **Step 1: Write failing e2e tests** in `signup-free-mode.e2e-spec.ts` (OTP off) and the OTP-on registration tests: `GET /auth/signup-options` returns `emailRequired: true`; registering with a phone and no email → 422 with `fields.email`; with an email → 201.
- [ ] **Step 2:** Run. Expected: FAIL. Implement it, and update `registerSeller`. Specs that need a phone-only owner (admin password link for phone-only owners, billing receipt with no owner email) set `email = NULL` on the user through `prisma.user.update` after registering. Search with `grep -rn "registerSeller(app, null" apps/api/test` and check each caller's intent.
- [ ] **Step 3:** In `RegisterForm.tsx`, when `emailRequired` is true, label the field `Email` with no "(optional)" or "email or phone" note, add `required`, and make phone `(optional)` unless OTP is on. Update its component test to cover both label variants. Update the Playwright registration helpers only if their labels change (they match `/^Email/`, so they should still pass).
- [ ] **Step 4:** Run `npm run check` and `npm run test:e2e`. Expected: PASS.

---

### Task 6: Account API: edit profile and change password (FR-AUTH-09)

**Files:**
- Modify: `packages/shared/src/schemas.ts`, `apps/api/src/common/errors.ts`, `apps/api/src/modules/auth/auth.repository.ts`, `apps/api/src/modules/auth/auth.service.ts`, `apps/api/src/modules/auth/auth.controller.ts`
- Create: `apps/api/test/account.e2e-spec.ts`

**Interfaces:**
- Produces (shared):
  - `accountUpdateSchema = z.object({ name: z.string().trim().min(2, 'Enter your name').max(100).optional(), email: <same email rule as registerSchema>.optional().or(z.literal('').transform(() => null)), phone: phone.optional().or(z.literal('').transform(() => null)) })`: omitted means untouched, `''` means clear. Type `AccountUpdateInput`.
  - `changePasswordSchema = z.object({ currentPassword: z.string().min(1, 'Enter your current password'), newPassword })`. Type `ChangePasswordInput`. Reuse the module-private `newPassword`.
- Produces (api):
  - `AuthError.wrongCurrentPassword()`: 422 `wrong_password`, field `currentPassword`, message `Your current password is not right.`
  - `AuthError.emailRequired()`: 422 `validation_failed`, field `email`, message `Enter your email. You need it to reset your password.`
  - `AuthError.contactRequired()`: 422 `validation_failed`, field `email`, message `Keep an email or a phone number.`
  - `AuthRepository.emailExists(email, exceptUserId?: string)` and `phoneExists(phone, exceptUserId?: string)` (extend the existing methods).
  - `AuthRepository.updateUser(userId, data: { name?: string; email?: string | null; phone?: string | null; phoneVerifiedAt?: Date | null })`
  - `AuthRepository.findPasswordHash(userId): Promise<string>`
  - `AuthRepository.revokeOtherSessions(userId, keepSessionId, db: Tx)`
  - `AuthService.updateAccount(userId: string, input: AccountUpdateInput): Promise<Me['user']>`. Rules: the email or phone of another user is 409 (`emailTaken` / `phoneTaken`), checked first and also mapped from a Prisma `P2002` race by `meta.target`. Clearing both is `contactRequired`. Clearing the email while `emailRequiredAtSignup()` (Task 5) is true is `emailRequired`. A changed phone sets `phoneVerifiedAt: null`.
  - `AuthService.changePassword(auth: { userId: string; sessionId: string }, input: ChangePasswordInput): Promise<void>`: verify the current password (argon2 `verify`), hash the new one *before* opening the transaction, then in one transaction `updatePassword` + `revokeOtherSessions`.
  - Routes: `PATCH /v1/auth/me` → `{ data: Me['user'] }`; `POST /v1/auth/password/change` → 200 `{ data: { ok: true } }`. Both are `@AllowAfterTrial()` (a seller must be able to secure their account after the trial). The change route gets `@Throttle({ default: { limit: 10, ttl: FIFTEEN_MIN } })`.

- [ ] **Step 1: Write failing e2e tests** `account.e2e-spec.ts`:
  - 401 anonymous on both routes.
  - `updates name, email and phone`: the response `data` keys are exactly `id, name, email, phone, locale, isPlatformAdmin` (no `passwordHash`), and `GET /auth/me` shows the new values.
  - `409 for another user's email` (`email_taken`, `fields.email`) and the same for phone (`phone_taken`).
  - `keeps own email without a conflict`: PATCH with the own email in upper case → 200, stored lower case.
  - `422 when clearing the email` (`fields.email`).
  - `422 wrong_password` for a wrong current password; the password is unchanged (login with the old one still works).
  - `422 for a 7-character new password`.
  - `revokes other sessions but keeps this one`: log in twice (clients A and B), change the password from A; A's `GET /auth/me` → 200, B's → 401; login with the new password → 200, with the old → 401.
  - `works after the trial ends`: set `trialEndsAt` in the past with prisma; PATCH → 200.
- [ ] **Step 2:** Run. Expected: FAIL (404 / 405). Implement the schemas, errors, repository, service and routes. Run. Expected: PASS. Add both rules to `test/rules.e2e-spec.ts` naming FR-AUTH-09 if that file lists rules per FR. Then `npm run check`.

---

### Task 7: Split settings into business, profit, couriers and account pages (web)

**Files:**
- Create: `apps/web/app/(app)/settings/layout.tsx`, `apps/web/app/(app)/settings/SettingsNav.tsx`, `settings/business/page.tsx`, `settings/business/BusinessDetailsForm.tsx`, `settings/profit/page.tsx`, `settings/profit/ProfitDefaultsForm.tsx`, `settings/couriers/page.tsx`, `settings/couriers/CourierRow.tsx`, `settings/account/page.tsx`, `settings/account/AccountForm.tsx`, `settings/account/AccountForm.test.tsx`, `settings/account/ChangePasswordForm.tsx`, `settings/account/ChangePasswordForm.test.tsx`, `apps/web/e2e/settings.spec.ts`
- Modify: `apps/web/app/(app)/settings/page.tsx` (now only `redirect('/settings/business')`)
- Delete: `apps/web/app/(app)/settings/SettingsForms.tsx` (its two components move into the new files unchanged, except for the split below)

**Interfaces:**
- Consumes: `PATCH /business` (each form sends only its own fields; omitted fields stay untouched), `PATCH /couriers/:id`, `GET /auth/me`, `PATCH /auth/me`, `POST /auth/password/change`, `SignupOptionsDto.emailRequired` from `GET /auth/signup-options`.
- Produces:
  - `SettingsNav`: a client leaf with links `Business` `/settings/business`, `Profit defaults` `/settings/profit`, `Couriers` `/settings/couriers`, `Account` `/settings/account`, and `aria-current="page"` on the active one. On phones it scrolls horizontally inside its own row.
  - `BusinessDetailsForm({ business })`: name, phone, city, Facebook page, address.
  - `ProfitDefaultsForm({ business, couriers })`: default courier, courier, return and packaging cost.
  - `AccountForm({ user, emailRequired })`: name, email, phone, `Save account`. Shows field errors from the API (`fieldError`) and `Account saved.`
  - `ChangePasswordForm()`: current password, new password, `Change password`; on success clears both fields and shows `Password changed. Other devices were logged out.`

- [ ] **Step 1: Write failing component tests** (mock `@/lib/client-api`):
  - `AccountForm`: submitting sends `PATCH /auth/me` with `{ name, email, phone }`; a 409 with `fields.email` shows `This email is already registered. Log in instead.` under the Email field.
  - `ChangePasswordForm`: a 422 `wrong_password` shows the message under `Current password`; success clears the inputs and shows the success status.
- [ ] **Step 2:** Run. Expected: FAIL. Implement the layout, nav, the four pages (server components fetching with `apiGet`, in parallel with `Promise.all` where they need two resources) and the forms. Use `refreshData(router)` after saves.
- [ ] **Step 3:** `grep -rn "'/settings'\|\"/settings\"\|/settings#" apps/web` and point each link at the right sub-route (e.g. the onboarding checklist and missing-cost hints → `/settings/profit`). `AppShell`'s `Settings` item stays `/settings` (it redirects) and still highlights for every sub-route.
- [ ] **Step 4: Playwright** `settings.spec.ts`: register, open `/settings/account`, change the password, log out, log in with the new password and land on `/dashboard`; then open each of the four settings tabs at 360 px and check that `document.documentElement.scrollWidth <= 360`.
- [ ] **Step 5:** Run `npm run check` and `npm run test:e2e`. Expected: PASS.

---

### Task 8: Business logo upload (FR-BIZ-01)

**Files:**
- Modify: `apps/api/package.json` (add `sharp`), `apps/api/src/config.ts`, `apps/api/.env.example`, `.gitignore` (`apps/api/storage/`), `packages/shared/src/types.ts` (`BusinessDto.logoUrl`), `apps/api/src/modules/business/business.errors.ts`, `business.service.ts`, `business.controller.ts`, `business.presenter.ts`, `business.repository.ts`, `apps/api/Dockerfile` (create `/app/storage` owned by `node`), `apps/web/app/(app)/settings/business/page.tsx`, `apps/web/components/AppShell.tsx`
- Create: `apps/api/src/modules/business/logo.image.ts`, `apps/api/src/modules/business/logo.image.spec.ts`, `apps/api/src/modules/business/logo.store.ts`, `apps/api/test/logo.e2e-spec.ts`, `apps/web/app/(app)/settings/business/LogoUpload.tsx`, `LogoUpload.test.tsx`

**Interfaces:**
- Produces:
  - Config `STORAGE_DIR` (default `storage`, resolved against `process.cwd()`); `config().storageDir: string`.
  - `LOGO = { maxBytes: 2 * 1024 * 1024, size: 256, maxInputPixels: 25_000_000, formats: ['png', 'jpeg', 'webp'] } as const` in `logo.image.ts`.
  - `toLogoWebp(input: Buffer): Promise<Buffer>`: `sharp(input, { limitInputPixels: LOGO.maxInputPixels })`, read `metadata()` and refuse any format not in `LOGO.formats` (decided by the file's content, never its name or MIME), `.rotate()` (EXIF), `.resize(256, 256, { fit: 'inside', withoutEnlargement: true })`, `.webp({ quality: 85 })`. Any sharp error throws `BusinessError.logoUnsupported()`.
  - `BusinessError.logoUnsupported()` 415 `logo_unsupported` `Use a PNG, JPG or WebP image.`; `BusinessError.logoTooLarge()` 413 `logo_too_large` `The logo must be 2 MB or smaller.`; `BusinessError.logoNotFound()` 404 `logo_not_found`.
  - `LogoStore` (injectable): `save(businessId, webp: Buffer): Promise<void>` (writes `<storageDir>/logos/<businessId>.webp.tmp`, then `rename`); `read(businessId): Promise<Buffer | null>`; `remove(businessId): Promise<void>` (ignores ENOENT).
  - `BusinessService.setLogo(businessId, file: Buffer): Promise<BusinessDto>`: convert, save, then `repo.update(businessId, { logoUrl: `/api/business/logo?v=${Date.now()}` })`. `BusinessService.removeLogo(businessId): Promise<BusinessDto>` sets `logoUrl: null` and removes the file. No transaction (one row, and file work stays outside transactions).
  - `BusinessDto.logoUrl: string | null`, passed through by `toBusinessDto`.
  - Routes: `POST /v1/business/logo` (multipart field `logo`, `FileInterceptor('logo', { limits: { fileSize: LOGO.maxBytes, files: 1, fields: 0 } })`; the multer size error maps to `logoTooLarge`, reusing or generalising `imports/file-too-large.interceptor.ts` into `common/`); `DELETE /v1/business/logo`; `GET /v1/business/logo` → the WebP with `Content-Type: image/webp` and `Cache-Control: private, max-age=86400`, or 404 JSON (same `StreamableFile` pattern as the CSV routes).
  - `LogoUpload({ logoUrl })`: shows the current logo (`<img alt="Business logo">`, 64 px) or a placeholder; a file input labelled `Upload logo` (`accept="image/png,image/jpeg,image/webp"`) that refuses files over 2 MB client-side with the API's message; a `Remove logo` button confirmed with `AlertDialog`. Uploads via a `FormData` helper in `@/lib/client-api` (reuse the one the import wizard uses).

- [ ] **Step 1: Write failing unit tests** `logo.image.spec.ts` (images generated in-test with `sharp({ create: … })`):
  - A 1000×500 PNG becomes WebP 256×128 (`sharp(out).metadata()`).
  - A 100×100 JPEG stays 100×100 (no enlargement).
  - `rejects a text file named .png`: `Buffer.from('hello')` → `logo_unsupported`.
  - `rejects an image over the pixel limit`: a 6000×6000 PNG (compresses to a tiny file) → `logo_unsupported`.
  - A GIF → `logo_unsupported`.
- [ ] **Step 2:** Run `npx jest logo.image`. Expected: FAIL. `npm i sharp -w @ph/api`, implement, run. Expected: PASS.
- [ ] **Step 3: Write failing e2e tests** `logo.e2e-spec.ts` (set `STORAGE_DIR` to a temp dir in `test/setup-env.ts`):
  - 401 anonymous on all three routes.
  - Upload a PNG → 201/200 with `data.logoUrl` matching `^/api/business/logo\?v=\d+$`; `GET /business/logo` → 200 `image/webp`.
  - Another business's `GET /business/logo` → 404 (each session sees only its own logo).
  - A 2 MB + 1 byte file → 413 `logo_too_large`. A text file → 415.
  - `DELETE` → `logoUrl: null`, then `GET` → 404.
  - After the trial ends, upload → 402 `trial_ended` (it's a normal write).
- [ ] **Step 4:** Run. Expected: FAIL. Implement the store, service, routes and presenter. Run. Expected: PASS.
- [ ] **Step 5:** Web: `LogoUpload` component test (an oversized file shows the 2 MB message and sends no request; success calls `refreshData`), mount it at the top of `/settings/business`, and show `business.logoUrl` (24 px, rounded) beside the business name in the `AppShell` sidebar when set.
- [ ] **Step 6:** Run `npm run check` and `npm run test:e2e`. Expected: PASS.

---

### Task 9: Docs and final verification

**Files:**
- Modify: `CLAUDE.md`, `README.md` (`STORAGE_DIR`, `sharp`), `docs/superpowers/plans/2026-11-06-profithishab-roadmap.md`

- [ ] **Step 1:** In `CLAUDE.md`:
  - Add a **Reports** paragraph: routes, `?to=YYYY-MM` (default the current Dhaka month), `format=csv`, taka with 2 decimals in CSV, `reports.repository.ts` under the profit exception.
  - Add an **Account** paragraph: `PATCH /auth/me`, `POST /auth/password/change`, both `@AllowAfterTrial()`; other sessions revoked; email required while `SMS_DRIVER=log`.
  - Add a **Logo** paragraph: limits, `STORAGE_DIR`, decided by content, stored outside the web root, served by `GET /business/logo`.
  - Add `ProfitService.monthly / expenseReport` if they're ever exported (they aren't now).
  - Add to Known gaps: logos on local disk need a volume, or object storage once there's more than one API instance.
  - Mark `@AllowAfterTrial()` as used by logout, account and password change.
- [ ] **Step 2:** In the roadmap, mark Phases 2 and 3 `**Status: done (2026-11-14).**`, tick SRS 11.1 items 5 and 10 in the text, and update the status date.
- [ ] **Step 3:** Run `npm run check` and `npm run test:e2e`. Expected: all green. Report the counts.
