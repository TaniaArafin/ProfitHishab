# Trial Banner and Manual Payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sellers see how many trial days are left, and after the 7-day trial they can pay ৳499 a month by bKash or Nagad. A platform admin confirms the payment, and confirming extends access.

**Architecture:**
- A shared `TrialBanner` in `AppShell` works from `me.business.trialEndsAt`; no new API call.
- A new Nest module `modules/billing` owns a `payments` table.
- Sellers submit a payment (method, sender number, transaction ID, months) at `POST /billing/payments`, which is allowed after the trial ends.
- Admins list, confirm and reject payments under `/admin/payments`, guarded by the existing `AdminGuard`.
- Confirming locks the payment and the business, extends access with `newAccessEnd({ mode: 'extend', days: months × 30 })`, and logs an `admin_actions` row, all in one transaction. After the commit, a receipt is emailed.

**Tech Stack:** NestJS 11, Prisma 6, PostgreSQL 16, Zod (shared), Next.js 15, shadcn/ui, Vitest, Playwright.

**Spec:**
- The roadmap: [2026-11-06-profithishab-roadmap.md](2026-11-06-profithishab-roadmap.md), Phase 4.
- Owner decisions from 2026-11-11:
  - ৳499 a month.
  - Manual bKash/Nagad.
  - Free means only the 7-day trial, with every feature.
  - No feature gating.
- [CLAUDE.md](../../../CLAUDE.md) for every layering, test and UI rule.

## Global Constraints

- Price comes from config `PLAN_PRICE_TAKA` (default `499`), never hard-coded in a component. Money is poisha: `49900` per month.
- One paid month = `BILLING_PERIOD_DAYS = 30` days. Allowed months per payment: `BILLING_MONTH_OPTIONS = [1, 3, 6, 12]`. Amount = price × months. No discounts.
- Methods: `BILLING_METHODS = ['bkash', 'nagad']`, labels `bKash` and `Nagad`. A method is offered only when its receiving number is configured: `PAYMENT_BKASH_NUMBER` and `PAYMENT_NAGAD_NUMBER`, both `01XXXXXXXXX`, both optional. Production refuses to start with neither.
- Payment statuses: `BILLING_PAYMENT_STATUSES = ['pending', 'confirmed', 'rejected']`, with a CHECK constraint.
- Transaction ID is trimmed, uppercased and must match `/^[A-Z0-9]{8,20}$/`. It is unique per method among pending and confirmed payments of **all** businesses, so one TrxID can never be accepted twice; a rejected payment releases it (partial unique index, follow-up migration `20261111100000_payments_trxid_reusable_after_reject`).
- At most one `pending` payment per business. A second one gets 409 `payment_pending`.
- Confirming extends access from the later of now and the current end. A business with **no end date (unlimited) stays unlimited**; the payment is still marked confirmed.
- Confirm and reject only work on a `pending` payment, otherwise 409 `payment_already_reviewed`. They are repeat-safe under double clicks: the payment row is locked first.
- Every confirm or reject writes `admin_actions` (`confirm_payment` or `reject_payment`) in the same transaction. `ADMIN_ACTIONS` and its CHECK are extended to match.
- `businessId` for seller routes comes from `@Auth()`. A seller never sees another business's payments.
- Banner thresholds:
  - Shown when the trial has **3 days or fewer** left, or has ended.
  - Never shown for unlimited (`trialEndsAt` null).
  - Never shown while more than 3 days remain.
- Copy (exact):
  - 2–3 days: `Your free trial ends in {n} days.`
  - 1 day: `Your free trial ends in 1 day.`
  - After the end: `Your free trial has ended. Your data is safe — pay to keep adding and changing orders.`
  - The button reads `Pay now` and links to `/billing`.
- The 402 message (`TrialError.ended`) gains the sentence `Pay from the Billing page to continue.`
- Never commit; the user commits.

## Review Focus

1. **A seller pays while 2 trial days remain.** Access must end 2 + 30 days from now, not 30. `newAccessEnd` already does this; the test is in Task 3.
2. **An admin double-clicks "Confirm".** Access is extended once, not twice; the second call is a 409. Test in Task 3.
3. **The same bKash TrxID submitted by two different businesses.** The second gets 409 `transaction_used`, case-insensitively (`8n7a6d5c4b` = `8N7A6D5C4B`). Test in Task 3.
4. **The trial ended and the seller is read-only.** Submitting a payment must still work (not 402), and after confirmation a write works without logging in again, because access is read on every request. Test in Task 3.
5. **The banner on a 360 px phone with a long Bangla business name.** It must wrap, with 0 px horizontal overflow. Checked in Task 6's Playwright run.

---

## File structure

```
packages/shared/src/enums.ts      + BILLING_METHODS, BILLING_METHOD_LABELS, BILLING_PAYMENT_STATUSES, BILLING_PAYMENT_STATUS_LABELS; ADMIN_ACTIONS + confirm_payment, reject_payment
packages/shared/src/trial.ts      + BILLING_PERIOD_DAYS, BILLING_MONTH_OPTIONS, trialBanner()
packages/shared/src/schemas.ts    + paymentSubmitSchema, paymentRejectSchema, adminPaymentListQuerySchema
packages/shared/src/types.ts      + BillingDto, PaymentDto, AdminPaymentDto
apps/web/components/TrialBanner.tsx (+ TrialBanner.test.tsx)
apps/web/components/AppShell.tsx  banner slot, "Billing" nav item, admin "Payments" item
apps/web/app/(app)/layout.tsx     passes trialEndsAt
apps/api/src/config.ts, apps/api/.env.example, apps/api/test/setup-env.ts
apps/api/prisma/schema.prisma, prisma/migrations/20261111090000_payments/migration.sql
apps/api/src/modules/billing/  billing.module.ts  billing.controller.ts  billing-admin.controller.ts
                               billing.service.ts  billing.repository.ts  billing.presenter.ts  billing.errors.ts
apps/api/src/modules/admin/admin.service.ts   + recordAction() (exported for billing)
apps/api/src/modules/auth/auth.module.ts      export Mailer
apps/api/test/billing.e2e-spec.ts
apps/web/app/(app)/billing/page.tsx  PaymentForm.tsx  PaymentForm.test.tsx
apps/web/app/(app)/admin/payments/page.tsx  PaymentReview.tsx  PaymentReview.test.tsx
apps/web/e2e/billing.spec.ts
```

---

### Task 1: Trial banner

**Files:**
- Modify: `packages/shared/src/trial.ts`, `packages/shared/src/shared.test.ts`, `apps/web/components/AppShell.tsx`, `apps/web/app/(app)/layout.tsx`, `apps/api/src/common/errors.ts`
- Create: `apps/web/components/TrialBanner.tsx`, `apps/web/components/TrialBanner.test.tsx`

**Interfaces (Produces):**
- `trialBanner(endsAt: Date | string | null, now: Date): { kind: 'ending'; daysLeft: number } | { kind: 'ended' } | null` in shared `trial.ts`.
  - Returns null when `endsAt` is null or `trialDaysLeft > 3`.
  - Returns `ended` when 0 days are left.
  - Otherwise returns `ending`.
  - Reuses `trialDaysLeft`.
- `<TrialBanner trialEndsAt={string | null} />`: a client component. It computes `trialBanner(trialEndsAt, new Date())` during render, uses shadcn `Alert` (`ending` = default/warning tone, `ended` = destructive tone, colours only from theme tokens), shows the exact copy from Global Constraints, and has a `Pay now` `Button asChild` → `Link href="/billing"`. It renders nothing when the result is null.
- `AppShell` gets a new prop `trialEndsAt: string | null` and renders `<TrialBanner>` at the top of the main column, above page content, on phone and desktop.
- `layout.tsx` passes `me.business.trialEndsAt`.
- `TrialError.ended()` message: append ` Pay from the Billing page to continue.`

- [ ] **Step 1: Write failing tests.**
  - `shared.test.ts`:
    - `trialBanner` returns `null` for `null`.
    - It returns `null` with 4 days left.
    - It returns `{ kind:'ending', daysLeft:3 }` at exactly 3 days.
    - It returns `{ kind:'ending', daysLeft:1 }` with 5 hours left.
    - It returns `{ kind:'ended' }` 1 ms after the end.
  - `TrialBanner.test.tsx`, with the clock faked through `vi.setSystemTime`:
    - It shows `Your free trial ends in 2 days.` and a `Pay now` link to `/billing`.
    - It shows `Your free trial ends in 1 day.` (singular).
    - It shows the ended copy.
    - It renders nothing for `null` and for 10 days left.
  - Update any API test that asserts the full 402 message text (search `trial_ended`) to the new message.
- [ ] **Step 2:** Run `npm test -w @ph/shared && npm test -w @ph/web`. Expected: FAIL.
- [ ] **Step 3:** Implement. The banner must not mirror state into an Effect (CLAUDE.md React rules); computing from `new Date()` during render is acceptable here because the page is force-dynamic and re-renders on each navigation.
- [ ] **Step 4:** Run `npm run check`. Expected: PASS.
- [ ] **Step 5:** Stop. The user commits.

### Task 2: Billing contract, config and the payments table

**Files:**
- Modify: `packages/shared/src/{enums,trial,schemas,types}.ts`, `shared.test.ts`, `apps/api/src/config.ts`, `apps/api/.env.example`, `apps/api/test/setup-env.ts`, `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20261111090000_payments/migration.sql`, `apps/api/src/modules/billing/billing.repository.ts`
- Test: `apps/api/test/billing.e2e-spec.ts` (database section)

**Interfaces (Produces):**
- Shared enums and constants from Global Constraints.
  - `BILLING_PAYMENT_STATUS_LABELS = { pending: 'Waiting for check', confirmed: 'Confirmed', rejected: 'Rejected' }`.
  - `ADMIN_ACTIONS` gains `'confirm_payment'` and `'reject_payment'`.
- `paymentSubmitSchema`:
  - `method: z.enum(BILLING_METHODS)`
  - `months: z.coerce.number().refine(in BILLING_MONTH_OPTIONS)`
  - `senderNumber`, normalised with `normalizePhone`; invalid gives the message `Enter the 11-digit number you paid from.`
  - `transactionId`, trimmed and uppercased; must match `/^[A-Z0-9]{8,20}$/`, otherwise `Enter the transaction ID from the bKash or Nagad SMS.`
- `paymentRejectSchema = { reason: string, trimmed, 3–300 chars }`.
- `adminPaymentListQuerySchema = { page, perPage ≤ 100 default 25, status: BILLING_PAYMENT_STATUSES default 'pending' }`.
- Types:
  - `PaymentDto { id, method, senderNumber, transactionId, months, amount, status, rejectReason: string|null, createdAt, reviewedAt: string|null, periodTo: string|null }`
  - `BillingDto { status: AccessStatus; accessEndsAt: string|null; daysLeft: number|null; pricePerMonth: number; methods: { method: BillingMethod; number: string }[]; monthOptions: number[]; pending: PaymentDto|null; payments: PaymentDto[] }`. `payments` is the newest 20.
  - `AdminPaymentDto extends PaymentDto { business: { id, name }, submittedBy: string|null, reviewedBy: string|null }`
- Config (`config().billing`) = `{ pricePerMonth: number /* poisha */, numbers: Partial<Record<BillingMethod,string>> }`, built from `PLAN_PRICE_TAKA` (int, 1–100000, default 499), `PAYMENT_BKASH_NUMBER` and `PAYMENT_NAGAD_NUMBER` (each optional, `/^01[3-9]\d{8}$/`).
  - `superRefine`: in production at least one number is required, at path `PAYMENT_BKASH_NUMBER`, with the message `production needs at least one receiving number`.
  - `setup-env.ts` sets `PAYMENT_BKASH_NUMBER=01700000001` and `PAYMENT_NAGAD_NUMBER=01800000001`.
  - `.env.example` documents all three.
  - Export the zod env schema from `config.ts` as `envSchema`, so a test can parse a production environment directly. `config()` is cached per process.
- Migration `payments`:
  - Columns: `id` uuid v7, `businessId` FK CASCADE, `submittedById` FK users SET NULL, `method`, `senderNumber`, `transactionId`, `months INT`, `amount INT`, `status` default `'pending'`, `rejectReason`, `reviewedById` FK users SET NULL, `reviewedAt`, `periodFrom`, `periodTo`, `createdAt`.
  - CHECKs: `method IN (…)`, `status IN (…)`, `months IN (1,3,6,12)`, `amount > 0`.
  - `UNIQUE(method, transactionId)` (replaced in the follow-up migration by a partial unique index `WHERE status <> 'rejected'`).
  - A partial unique index `ON payments(businessId) WHERE status = 'pending'`, so the database itself enforces one pending payment per business.
  - Index `(status, createdAt)`.
  - Also replace `admin_actions_action_check` with the six actions.
  - Also add `businesses."firstPaidAt" TIMESTAMPTZ NULL`, the first time a payment was confirmed. It is set in Task 3 and read in Task 4, so paying sellers are not told their "free trial" is ending.
- `BillingRepository`:
  - `create(businessId, submittedById, data, db?)`
  - `pendingFor(businessId)`
  - `recentFor(businessId, limit)`
  - `lockForUpdate(paymentId, tx)`
  - `markConfirmed(id, { reviewedById, at, periodFrom, periodTo }, tx)`
  - `markRejected(id, { reviewedById, at, reason }, tx)`
  - `paginateForAdmin({ status, page, perPage })`: cross-business, oldest first for pending (newest first for confirmed and rejected); joins the business name and user names.
  - `findForAdmin(id)`
  - `transaction(fn)`

- [ ] **Step 1: Write failing tests.**
  - `shared.test.ts`:
    - `paymentSubmitSchema` uppercases `' 8n7a6d5c4b '` to `'8N7A6D5C4B'`.
    - It normalises the sender `+8801712345678` to `01712345678`.
    - It rejects `months: 2`.
    - It rejects TrxID `'ABC'`.
  - `billing.e2e-spec.ts > database`:
    - `refuses an unknown payment status`.
    - `refuses months 2`.
    - `refuses the same method + transaction ID twice across businesses` (unique violation).
    - `refuses a second pending payment for one business` (partial unique index).
    - `accepts confirm_payment in admin_actions`.
  - A config unit test, if a config spec exists, otherwise in `billing.e2e-spec.ts`: production with no receiving number throws `production needs at least one receiving number`.
- [ ] **Step 2:** Run `npm test -w @ph/shared && npm test -w @ph/api -- billing`. Expected: FAIL.
- [ ] **Step 3:** Implement. Generate the SQL with `prisma migrate diff` (CLAUDE.md "Migrations"); add the CHECKs, the partial unique index and the replaced admin CHECK by hand; then `prisma migrate deploy` on `profithishab` and `profithishab_test`. If Prisma P1001 appears, run `docker compose restart db`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Stop. The user commits.

### Task 3: Billing API (seller and admin)

**Files:**
- Create: `modules/billing/{billing.module,billing.controller,billing-admin.controller,billing.service,billing.presenter,billing.errors}.ts`
- Modify:
  - `apps/api/src/app.module.ts`
  - `modules/admin/admin.service.ts`: add `recordAction`
  - `modules/admin/admin.module.ts`: export `AdminGuard`
  - `modules/auth/auth.module.ts`: export `Mailer`
  - CLAUDE.md "Current public surfaces"
- Test: `apps/api/test/billing.e2e-spec.ts`

**Interfaces (Produces):**
- `BusinessDto` (shared `types.ts`) gains `firstPaidAt: string | null`; the business presenter fills it in. `/auth/me` therefore carries it.
- `AdminService.recordAction(entry: { adminUserId; businessId; action: AdminAction; details }, tx: Tx): Promise<void>`: delegates to `AdminRepository.logAction`.
- `BillingError`:
  - `paymentPending()` 409 `payment_pending`: `You already sent a payment. We will check it soon.`
  - `transactionUsed()` 409 `transaction_used`: `This transaction ID was already used.`
  - `methodUnavailable()` 422 `payment_method_unavailable`
  - `notFound()` 404 `payment_not_found`
  - `alreadyReviewed()` 409 `payment_already_reviewed`
- `BillingService`:
  - `overview(auth: AuthContext, now = new Date()): Promise<BillingDto>`. Status and days left come from `accessStatus` and `trialDaysLeft` over `auth.trialEndsAt` and `auth.blockedAt`.
  - `submit(auth, input: PaymentSubmitInput): Promise<PaymentDto>`.
    - The method must have a configured number, otherwise `methodUnavailable`.
    - `amount` = `config().billing.pricePerMonth * months`.
    - Map the Prisma `P2002` on `(method, transactionId)` to `transactionUsed`, and on the pending index to `paymentPending`.
  - `adminList(query)`: `{ data: AdminPaymentDto[], meta }`.
  - `confirm(adminUserId, paymentId, now = new Date()): Promise<AdminPaymentDto>`. In one transaction:
    1. `lockForUpdate`; it must exist (`notFound`) and be pending (`alreadyReviewed`).
    2. `BusinessService.lockAccess(businessId, tx)`.
    3. `next` = the current end `=== null ? null : newAccessEnd({mode:'extend', days: months * BILLING_PERIOD_DAYS}, currentEnd, now)`.
    4. `BusinessService.setAccessEnd`, then the new `BusinessService.markPaid(businessId, at: Date, tx)`, which sets `firstPaidAt` only when it is still null.
    5. `markConfirmed` with `periodFrom = max(now, currentEnd)` and `periodTo = next`.
    6. `AdminService.recordAction({ action:'confirm_payment', details:{ paymentId, amount, months, from, to } })`.
    - After the commit: `void mailer.send(...)` to the owner's email if they have one. Subject `ProfitHishab payment confirmed`. The text has the amount (`formatTaka`), months and the new end date in Dhaka time. Failures are logged, not thrown.
  - `reject(adminUserId, paymentId, reason, now)`: lock, must be pending, `markRejected`, then `recordAction('reject_payment', { paymentId, reason })`. One transaction; no access change.
- Routes:
  - `BillingController` `@Controller('billing') @AllowAfterTrial()`: `GET /billing`, and `POST /billing/payments` (201).
  - `BillingAdminController` `@Controller('admin/payments') @UseGuards(AdminGuard) @AllowAfterTrial()`: `GET /admin/payments?status=`, `POST /admin/payments/:id/confirm` (200), `POST /admin/payments/:id/reject` (200).

- [ ] **Step 1: Write failing e2e tests.** Make an admin as in `admin.e2e-spec.ts`; use a `Mailer` spy as in `password-reset.e2e-spec.ts`.
  - `401 anonymous on every billing route`. `404 for a seller on /admin/payments`.
  - `GET /billing shows price 49900, both methods with their numbers, monthOptions [1,3,6,12], trial status and days left`. Payload keys must not include `submittedById`, `reviewedById` or `businessId`.
  - `submits a payment with amount = 49900 × months, status pending`, and `pending` appears in `GET /billing`.
  - `a second payment while one is pending is 409 payment_pending`.
  - `the same TrxID from another business, lower-case, is 409 transaction_used` (Review Focus 3).
  - `submitting works after the trial ended (not 402)` (Review Focus 4).
  - `confirm extends access from the current end` (Review Focus 1): set `trialEndsAt` to now + 2 days; confirming 1 month makes the new end ≈ now + 32 days (±1 min).
  - `confirm on an ended trial starts from now`: ≈ now + 30 days. The seller's next write (`POST /products`) is 201 on the same session (Review Focus 4).
  - `confirm keeps an unlimited business unlimited`.
  - `a second confirm is 409 payment_already_reviewed and access moved only once` (Review Focus 2).
  - `confirm sets firstPaidAt once`: `/auth/me` shows `business.firstPaidAt`, and a later confirm leaves it unchanged.
  - `confirm writes a confirm_payment admin action and emails the owner a receipt with ৳499`.
  - `reject keeps access unchanged, records the reason, and lets the seller submit again`.
  - `rolls back when recording the admin action fails`: spy `AdminService.recordAction` to reject. The payment stays pending and access is unchanged.
  - `a seller never sees another business's payments`: GET `/billing` lists only their own. Add `payments` to the cross-tenant test in `app.e2e-spec.ts`.
  - `admin list filters by status and shows business name and amount`.
- [ ] **Step 2:** Run `npm test -w @ph/api -- billing`. Expected: FAIL.
- [ ] **Step 3:** Implement. The controllers stay thin. `BillingService` never imports `PrismaService` and reaches `admin_actions` only through `AdminService.recordAction`.
- [ ] **Step 4:** Run `npm test`. Expected: PASS, including every existing test.
- [ ] **Step 5:** Stop. The user commits.

### Task 4: Seller billing page

**Files:**
- Create: `apps/web/app/(app)/billing/page.tsx`, `PaymentForm.tsx`, `PaymentForm.test.tsx`
- Modify:
  - `apps/web/components/AppShell.tsx`: an Account group item `{ href: '/billing', label: 'Billing', icon: CreditCard }`, and pass `me.business.firstPaidAt` through to the banner.
  - `apps/web/components/TrialBanner.tsx` and its test, plus `apps/web/app/(app)/layout.tsx`: a new prop `paid: boolean` (= `firstPaidAt !== null`). When paid, the copy changes:
    - `Your plan ends in {n} days.`
    - `Your plan ends in 1 day.`
    - `Your plan has ended. Your data is safe — pay to keep adding and changing orders.`
  - `apps/web/middleware.ts`: add `/billing` to `APP_PREFIXES`

**Behaviour:**
- The server page fetches `GET /billing` and shows a status card:
  - `trial`: `Free trial — {n} days left`
  - `ended`: `Free trial ended`
  - with an end date in the future after payment: `Active until {date}`. To tell this apart from `trial`: show `Active until` when `me.business.firstPaidAt` is set. Either fetch `/auth/me` in parallel with `Promise.all`, or add `firstPaidAt` to `BillingDto` in Task 3's service. Prefer whichever keeps one request; ledger the choice.
  - `unlimited`: `No time limit`
- Price line: `৳499 per month`, from `formatTaka(pricePerMonth)`.
- If `pending`: a notice `We are checking your payment ({method}, {transactionId}). This usually takes a few hours.`, and no form.
- Otherwise, `PaymentForm` (client) with these steps:
  1. **Choose months**: `SelectField` with the options `1 month — ৳499`, `3 months — ৳1,497`, and so on (price × months).
  2. **Send money**: `Open bKash (or Nagad), choose Send Money, and send {amount} to {number}.`, with a copy button for the number. The method is a `SelectField` showing only configured methods.
  3. **Tell us**: `Your bKash/Nagad number` and `Transaction ID (TrxID)`, both labelled `Input`s. Submit `I have paid`.
  - Field errors come from `fieldError`.
  - After success, `refreshData(router)`.
- History: `Table` from `md` with stacked cards below. Columns: date, months, amount, method, TrxID, status badge (labels from `BILLING_PAYMENT_STATUS_LABELS`), and the reject reason when present.

- [ ] **Step 1: Write failing Vitest tests** in `PaymentForm.test.tsx`, mocking `@/lib/client-api`:
  - `shows the amount for the chosen months` (3 months → `৳1,497`).
  - `sends method, months, senderNumber, transactionId to POST /billing/payments`.
  - `shows the field error from the API under Transaction ID`.
  - `only offers configured methods`.
  - In `TrialBanner.test.tsx`: `uses "Your plan ends in 2 days." when paid`, and the paid ended copy.
- [ ] **Step 2:** Run `npm test -w @ph/web`. Expected: FAIL.
- [ ] **Step 3:** Implement with `components/ui/*` only, with no native `<select>`. Every control has a label. Phone width uses `grid-cols-[minmax(0,1fr)]`.
- [ ] **Step 4:** Run `npm run check`. Expected: PASS.
- [ ] **Step 5:** Stop. The user commits.

### Task 5: Admin payments queue

**Files:**
- Create: `apps/web/app/(app)/admin/payments/page.tsx`, `PaymentReview.tsx`, `PaymentReview.test.tsx`
- Modify: `AppShell.tsx` (`ADMIN_GROUP` gains `{ href: '/admin/payments', label: 'Payments', icon: Banknote }`), and the admin business detail page, which gains a `Payments` link filtered to the business only if trivial. Otherwise skip it and ledger the decision.

**Behaviour:**
- Status tabs (Pending / Confirmed / Rejected) as links using `?status=`, plus pagination.
- Each row: submitted time (Dhaka, using `admin/format.ts`), business name linking to `/admin/businesses/{id}`, amount, months, method, sender number, TrxID, and the submitter.
- Pending rows have two actions:
  - **Confirm**: an `AlertDialog` with the text `Confirm ৳{amount} from {senderNumber} (TrxID {id})? This adds {months × 30} days of access. Check your {method} statement first.`
  - **Reject**: an `AlertDialog` with a labelled `Textarea` `Reason` (3–300 chars), shown to the seller.
- After either action, `refreshData(router)`. Buttons are disabled while the request is pending.

- [ ] **Step 1: Write failing Vitest tests:**
  - `confirm asks first, then calls POST /admin/payments/{id}/confirm once`.
  - `reject needs a reason and sends it`.
  - `buttons are disabled while the request runs`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm run check`. Expected: PASS.
- [ ] **Step 5:** Stop. The user commits.

### Task 6: End-to-end flow and docs

**Files:**
- Create: `apps/web/e2e/billing.spec.ts`
- Modify: `CLAUDE.md` (a "Billing" section under API rules; remove "No payment yet" from Known gaps), `README.md` (`PAYMENT_*`, `PLAN_PRICE_TAKA`), the roadmap Phase 4 status.

- [ ] **Step 1: Write the Playwright test** `trial ends → seller pays → admin confirms → seller can add a product`, on desktop and phone.
  - Ending a trial needs a DB write. Follow how the existing e2e setup reaches the API: if there's no hook, add a tiny Node helper in `e2e/` that runs `UPDATE businesses SET "trialEndsAt" = now() - interval '1 minute'` through `pg` against `DATABASE_URL`. That one is a dev dependency; ledger it.
  - Make the admin with `node dist/admin-grant.js`, as in the earlier verification script.
  - Assert the banner shows the ended copy and `Pay now` opens `/billing`.
  - Submit TrxID `TESTTRX` + a timestamp.
  - The admin confirms on `/admin/payments`.
  - The seller reloads: the banner is gone, and creating a product succeeds.
  - On phone width: 0 px horizontal overflow on `/billing` and `/admin/payments` (Review Focus 5).
- [ ] **Step 2:** Run against production builds (API `node dist/main.js` with `WEB_ORIGIN=http://localhost:3100`; web `next build && next start -p 3100`): `E2E_BASE_URL=http://localhost:3100 npx playwright test billing`. Expected: PASS.
- [ ] **Step 3:** Update the docs listed above.
- [ ] **Step 4:** Run `npm run check` and `npm run test:e2e`. Expected: all PASS.
- [ ] **Step 5:** Stop. The user commits.
