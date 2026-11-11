# ProfitHishab Roadmap: from today to the first paying sellers

> **For agentic workers:** This is the master plan. It splits the remaining work into phases. Each phase gets its own implementation plan in this folder before work starts. Only Phase 1 has one so far: [2026-11-06-excel-import.md](2026-11-06-excel-import.md). Write the next phase's plan with superpowers:writing-plans when the previous phase ships.

**Goal:** Finish V1 as defined in [SRS.md](../../../SRS.md), add what is needed to charge sellers, launch to the first 20 sellers, then grow into V2.

**Spec:** [SRS.md](../../../SRS.md) (V1 = sections 5–11; later versions = section 12). Engineering rules: [CLAUDE.md](../../../CLAUDE.md).

**Status date:** 2026-11-06. Nothing after `9ee3926` is committed; the user commits.

## Global constraints (every phase)

- Run `npm run check` before finishing any task; `npm run test:e2e` when a user flow changes.
- Never commit; the user commits. No destructive git commands on uncommitted work.
- Money is integer poisha; dates are `YYYY-MM-DD` in `Asia/Dhaka`; phones are normalised to `01XXXXXXXXX`.
- Every Prisma call lives in a repository; modules talk only through exported services; `businessId` comes from `@Auth()`.
- Every new tenant-owned table gets a case in the cross-tenant test in `apps/api/test/app.e2e-spec.ts`.
- Every status-like column has a `CHECK` constraint matching `packages/shared/src/enums.ts`.
- UI uses `components/ui/*` (shadcn) and works from 360 px to 1920 px+.

---

## Part A: What is built

| Area | SRS | State |
|---|---|---|
| Monorepo, Docker Compose, CI file, Prisma, seed | Day 1 | Done (CI not yet run on GitHub) |
| Register, login, logout, log out everywhere, sessions, CSRF, rate limits | FR-AUTH-01–05, 08 | Done |
| Forgot password by email | FR-AUTH-06 | Done (needs a real SMTP account to work in production) |
| 7-day free trial, read-only after it ends | (not in SRS) | Done |
| Phone OTP sign-up behind `OTP_REQUIRED` | (not in SRS) | Done, off by default; no SMS gateway yet |
| Business profile, couriers, profit settings | FR-BIZ-01 (without logo), 02–04 | Done |
| Onboarding checklist on the empty dashboard | FR-BIZ-05 | Done |
| Products, categories, price history, missing-cost screen, Typesense search | FR-PROD-01–07 | Done |
| Orders: create, edit, status flow, bulk status, stock, per-order profit, idempotency | FR-ORD-01–11 | Done |
| Customers with computed stats and profile | FR-CUST-01–05 | Done |
| Expenses and categories, double-count warning | FR-EXP-01–06 | Done |
| Profit calculator, dashboard, trend, insights, data-quality banner | Section 6, FR-DASH-01–09 | Done |
| Product profitability page | FR-PP-01–05, FR-REP-02 (page only) | Done (no CSV export) |
| Landing page | Section 9 | Done (English only) |
| Platform admin panel | FR-V2-09 (early) | Done: list, access changes, block, password link, history |
| shadcn UI, responsive on every screen size | Section 9 | Done |

## Part B: What is left, in build order

Each phase ends with working, tested software. A phase starts only after the one before it ships. The order follows SRS 11, which says import, the profit dashboard and product profitability can never be cut, plus what is needed to take money.

### Phase 1: Excel / CSV order import (FR-IMP-01–13)

**Why first:** the SRS calls import "V1 priority" and never-cut. Sellers keep their orders in Excel; without import nobody sees their profit in the first five minutes.

**Delivers:** `/imports` history with undo, a four-step wizard at `/imports/new` (upload → map columns → map statuses → preview and import), a result screen with a link to fix missing costs, a downloadable template, and a rejected-rows CSV.

**Done when:** acceptance items 2–4 of SRS 11.1 pass with the fixture file. 237 rows give 225 valid, 8 duplicate and 4 invalid; a re-upload is all duplicates; undo removes exactly those orders. 5,000 rows import in under 20 s.

**Plan:** [2026-11-06-excel-import.md](2026-11-06-excel-import.md)

### Phase 2: Reports and CSV export (FR-REP-01–04)

**Delivers:**
- `/reports/monthly-profit`: the last 12 months, one row each, with the full statement from `profit.calculator.ts`.
- `/reports/expenses`: totals by category and month.
- A CSV export on all three reports (including the existing `/reports/products`). UTF-8 with a BOM so Bangla opens in Excel. It reuses `apps/api/src/common/csv.ts` from Phase 1.
- A "Reports" nav group.

**Done when:** SRS 11.1 items 5 and 10 pass. The reference figures are ৳5,20,000 revenue, ৳1,20,000 net profit and 23.1% margin, from the Phase 1 fixture plus ৳50,000 ads and ৳15,000 other expenses. The CSV opens in Excel with correct Bangla.

**Size:** small. Mostly SQL in `ProfitRepository` plus three pages.

### Phase 3: Account settings and sign-up safety (FR-AUTH-07 rule, FR-AUTH-09, FR-BIZ-01 logo)

**Delivers:**
- `/settings/account`: change password (current password required, other sessions revoked) and edit name, email and phone (uniqueness checked).
- **Email required at sign-up while no SMS gateway exists.** FR-AUTH-07 says phone-only sign-up is disabled without a gateway. Today a phone-only seller with OTP off cannot reset a password themselves; only an admin password link helps them.
- Logo upload (PNG/JPG/WebP up to 2 MB, resized to 256 px, stored outside the web root). This is last in the SRS cut order, so it can slip to after launch.
- Split `/settings` into the SRS sub-routes: business, couriers, profit, account.

**Done when:** e2e tests cover a wrong current password (422), a taken email (409), and sessions revoked after a change.

### Phase 4: Getting paid (not in the SRS; SRS needs a new section first)

**Why:** after the 7-day trial a seller is read-only, and there is no way to pay. Today an admin can only "Add days".

**Decided (2026-11-11):** there is no free plan. "Free" means only the 7-day trial, and the trial includes every feature, the Steadfast connection too, so sellers can try everything and give feedback. After 7 days the seller must pay to keep using the app (until then it is read-only, as today). Plans decide only how long access lasts, never which features are available. Don't build feature gating.

**Decide before planning:**
- Price per month.
- Plans: one plan, or several.
- Payment method. Recommended start: manual bKash/Nagad send-money with a transaction ID that an admin confirms. A gateway (SSLCommerz, bKash PGW, Nagad) comes later.

**Delivers (manual-payment version):**
- Tables `plans`, `subscriptions` and `payments`, with CHECKs on status.
- The access end date (`trialEndsAt`, renamed or wrapped as `accessEndsAt`) driven by paid periods.
- A seller-side `/billing` page: current status, days left, a "Pay with bKash" instruction, and a form to submit the transaction ID. Submitting is allowed after the trial ends via `@AllowAfterTrial()`.
- An admin queue of payments to confirm or reject. Confirming extends access by the plan period in one transaction with an `admin_actions` row.
- A trial banner in `AppShell`, starting 3 days before the end, using `trialDaysLeft` from shared.
- A paywall screen instead of raw 402 errors.
- Email receipts through `Mailer`.

**Done when:**
- A seller can go from an ended trial to paid without an admin touching the database.
- Confirming the same payment twice is refused.
- The cross-tenant test covers `payments`.

**Safe with future branches:** subscriptions belong to the business, not a branch, so Phase 7's multi-store needs no change here.

### Phase 5: Bangla language (SRS 4 "Bangla default", section 9)

**Delivers:**
- `next-intl` (or a small message-catalogue helper) with `bn` as the default and `en` switchable per user, stored on `users.locale`.
- Bangla digits as an option (SRS 4 money display).
- A Bangla landing page.
- API error messages as codes, translated on the web.

**Note:** SRS 11 lists "English locale" in the cut order, which means Bangla is the must-have. Interview the first sellers before translating everything; the landing page and dashboard come first.

**Done when:** every page renders in `bn` with no English UI text left, and Playwright runs in both locales.

### Phase 6: Launch readiness (SRS 10, day 14)

**Delivers:**
- **Hosting:** one VPS (e.g. Hetzner or DigitalOcean Singapore) running Docker Compose with API, web, Postgres and Typesense behind Caddy for HTTPS, or a managed alternative. Domain and DNS. `COOKIE_SECURE=true`.
- **Email:** a Brevo or Resend SMTP account; set `MAIL_DRIVER=smtp` and `SMTP_*`, with SPF and DKIM on the domain.
- **Backups:** a nightly `pg_dump` to off-server storage (e.g. Backblaze B2 or S3) with 14-day retention. A restore must be tested once before launch.
- **Monitoring:** Sentry for API and web (a CLAUDE.md known gap) and an uptime check on `/health`.
- **Security:** a CSP with per-request nonces (a CLAUDE.md known gap) and HSTS. Resolve `npm audit` for body-parser, multer, zod, postcss and deepmerge-ts.
- **CI:** the first green run of `.github/workflows/ci.yml` on GitHub.
- **Privacy (SRS 10):** a seller can export all their business data (a zip of CSVs) and delete their business.
- **Performance check:** the dashboard under 800 ms p95 with 50,000 seeded orders, and app-page JavaScript under 200 KB gzipped.
- **Legal:** terms and privacy pages linked from the landing page and sign-up.

**Done when:** every item in SRS 11.1 is ticked on the production URL.

### Phase 7: First sellers and feedback (day 15 onward)

Launch to the 20 Dhaka sellers from SRS 11. Use their real files to extend the header synonym list from Phase 1. Watch the admin panel for sign-ups and activity. Decide when to switch on `OTP_REQUIRED`; that needs Phase 8.

### Phase 8: SMS gateway and phone reset (FR-AUTH-07)

**Decide:** a Bangladeshi bulk-SMS provider, roughly ৳0.25–0.50 per SMS (e.g. SSL Wireless, BulkSMSBD, Alpha SMS).

**Delivers:**
- A real `SmsSender` driver that production accepts. Then `OTP_REQUIRED=true` gives one trial per verified phone.
- Forgot password by SMS: a 6-digit code, 10 minutes, 5 attempts. This reuses `otp.ts`.
- Phone-only sign-up allowed again.

---

## Part C: After V1 (SRS 12; plan each when V1 has 20–50 active sellers)

| Version | Contents | New infrastructure |
|---|---|---|
| V2: seller operating system | Courier dashboard and comparison (FR-V2-01), COD reconciliation (02), return management (03), customer risk indicator (04), segments (05), marketing analytics and ROAS (06), alerts (07), PDF/XLSX exports (08), richer admin with import failures (09) | Redis and BullMQ (background imports past 5,000 rows, scheduled alerts, PDF). Move `LoginAttempts` to Redis before a second API instance. |
| V3: AI copilot | Business doctor, product advisor, forecast, screenshot to data, Bangla business chat with read-only tools scoped to one business, monthly AI report, AI alerts (FR-V3-01–07) | Claude API with business-scoped read-only tools |
| V4: commerce infrastructure | Courier APIs (Pathao, Steadfast, RedX…), Facebook/Instagram sync, payment reconciliation, light inventory, multi-store/branches, team roles on `business_members`, public API and webhooks (FR-V4-01–08) | Webhooks, API keys |

**Product batches and expiry (pharmacy, cosmetics, food):**
- Stock is held per batch: `product_batches` with `productId`, `batchNo`, `expiresAt`, `quantity` and `costPrice`.
- A sale takes from the batch that expires first.
- Expiry alerts: expiring within 30 days, and already expired.
- Expired stock written off counts as a loss in profit.
- Pharmacy extras: generic name, strength, unit (strip, box, piece).
- This is the same work as FR-V4-04 (purchases, suppliers, stock adjustments), so build them together. Orders, returns, import and stock all change.
- First, ask the early sellers how many are pharmacies. Online medicine sales in Bangladesh are DGDA-regulated, so demand from Facebook sellers may be low.

**Branches and roles (asked earlier):** `business_members` already exists, so team roles (FR-V4-06) fit without a migration of existing data. Multi-store (FR-V4-05) adds a `stores` table under a business. Subscriptions stay on the business (Phase 4), so neither breaks billing.

## Part D: Open decisions for the owner

| # | Decision | Needed by |
|---|---|---|
| 1 | Price and plans | Phase 4 |
| 2 | Manual bKash first, or a gateway from the start | Phase 4 |
| 3 | Hosting provider and domain name | Phase 6 |
| 4 | SMTP provider (Brevo or Resend) | Phase 6 |
| 5 | SMS provider, and when to turn on OTP | Phase 8 |
| 6 | Update SRS.md with the trial, OTP, admin panel and billing sections | Before Phase 4 |

## Part E: Housekeeping

- Local dev DB: about 160 test businesses from verification runs. Clean up before demos.
- The DMS container `dms-pgsql-1` is stopped because it shares port 5434. Moving ProfitHishab to 5435 in `docker-compose.yml` and `.env` would end the clash.
