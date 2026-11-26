# Products for every business — Stage 2 (batches and expiry) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Medicine, grocery and cosmetics sellers receive stock in batches with an expiry date; sales take the batch that expires first (FEFO) at that batch's cost; expired stock can't be sold, is flagged on the product list, and is cleared in one click as a loss in that month's profit.

**Architecture:** A product gets `tracksBatches`. A new `stock_batches` table holds each received lot (batch no, expiry date, remaining quantity, unit cost) per variant. `product_variants.stock` stays the one stock count (receive adds, sales subtract, clear subtracts); batches say which lot that stock is in. An order line of a tracked variant stores its `batchAllocations` (jsonb) and a `unitCost` averaged from the batches it took; cancel/return/edit put the same quantities back into the same batches. Clearing expired stock zeroes the expired batches, writes a `stock_writeoffs` row per batch and one expense in the built-in "Expired stock" category (kind `other`) dated today, so the existing profit statement, dashboard and reports show the loss with no new profit code.

**Spec:** [docs/superpowers/specs/2026-11-25-products-for-every-business-design.md](../specs/2026-11-25-products-for-every-business-design.md) §4, §5.2–5.4, §6, §8, §10, §11, §12 stage 2, §14 decision 2.

## Global Constraints

- Never commit. `npm run check` before finishing each task; `npm run test:e2e` for flow changes.
- "Expired" means `expiresOn < today` in the business timezone; a batch is sellable on its expiry day.
- Expired stock can't be sold: FEFO allocates from fresh batches only; a line whose variant has expired stock and no fresh stock is 422 `stock_expired`. A variant with neither (plain zero stock) still sells, going negative as today (FR-PROD-07); quantity beyond fresh batches is taken unallocated at the variant's cost.
- Order search hides a variant whose expired stock > 0 and fresh stock ≤ 0. The product list shows it with "Expired: N unit (৳cost)" and **Clear stock** (confirmed in-page).
- Line cost: `unitCost = round(Σ allocated qty × batch cost + unallocated × variant cost) / qty)`; money stays whole poisha.
- Imported orders never move stock or allocate batches (as today).
- Tracking is on by default for new products of Cosmetics & beauty, Food & grocery, Medical & pharmacy.
- Every new tenant table (`stock_batches`, `stock_writeoffs`) gets a cross-tenant case; status-like columns get `CHECK`s; money ≥ 0.

## Review Focus

1. **Return/cancel after FEFO** puts each quantity back into the batch it came from (not the newest). → Task 3 test `cancelling restores the same batches`.
2. **Editing a line of a FEFO order** re-allocates without double-counting stock. → Task 3 test `editing an order re-allocates batches`.
3. **Clear stock twice / concurrently** writes one loss only. → Task 2 test `clearing twice clears once`.
4. **Expiry day boundary** (Asia/Dhaka): a batch expiring today is still sellable. → Task 1 unit test.
5. **Profit:** the cleared cost appears once in that month's net profit and expense report. → Task 2 test.

---

### Task 1: Shared rules
**Files:** `packages/shared/src/products.ts`, `schemas.ts`, `types.ts`, `shared.test.ts`.
- `businessTypeDefaults()` gains `tracksBatches: boolean`.
- `allocateFefo(batches: Array<{id, expiresOn, quantity, unitCost}>, quantity, today) → { allocations: Array<{batchId, quantity, unitCost}>, unallocated }` — fresh batches only (`expiresOn >= today`), earliest expiry first, then oldest id; 3-decimal rounding.
- `isExpired(expiresOn, today)`; `EXPIRY_SOON_DAYS = 30`.
- Schemas: `receiveStockSchema { variantId?, batchNo?: ≤40, expiresOn: isoDate, quantity > 0 ≤3 dec, unitCost: money }`; `productSchema`/update gain `tracksBatches` (default false).
- Types: `BatchDto { id, variantId, variantLabel, batchNo, expiresOn, receivedOn, quantity, unitCost, expired, expiresInDays }`; `ProductDto` + `tracksBatches`, `expiredStock`, `expiredCost`; `VariantDto` + `expiredStock`; `OrderItemDto` + `batches: Array<{batchNo, expiresOn, quantity}>`; `ExpirySummaryDto { expired: {batches, products, cost}, soon: {batches, cost} }`; `ClearStockResultDto { quantity, cost }`.
- Tests: Napa 150 strips from NP2604 (120 @ 920, expires 2026-12-31) and NP2611 (200 @ 950) → allocations [120, 30], cost 138900; an expired batch is skipped; a batch expiring today is used; shortfall is `unallocated`.

### Task 2: Database, receive stock, batches list, clear stock
**Files:** `schema.prisma`, migration `<ts>_stock_batches`, `modules/products/batches.repository.ts` (new), `batches.service.ts` (new, behind `ProductsService`), `products.controller.ts`, `products.presenter.ts`, `products.repository.ts`; `modules/expenses` (`ExpensesService.recordStockWriteOff(businessId, date, amount, note, createdById, tx)` find-or-creates the system category "Expired stock"). Test: `apps/api/test/batches.e2e-spec.ts`, cross-tenant in `app.e2e-spec.ts`, `test/helpers.ts` TRUNCATE.
- Tables: `products.tracksBatches bool default false`; `stock_batches (id, businessId, productId, variantId FK cascade, batchNo text null, expiresOn date, quantity float8, unitCost int ≥0, receivedOn date, createdAt)`, index `(variantId, expiresOn)`; `stock_writeoffs (id, businessId, productId, variantId, batchId FK set null, batchNo, expiresOn, quantity > 0, unitCost, cost ≥ 0, writtenOffOn date, expenseId FK set null, createdById, createdAt)`; `order_items.batchAllocations jsonb default '[]'`.
- Routes: `POST /products/:id/batches` (receive: product must track batches, else 422 `batches_not_tracked`; plain product's variant when `variantId` absent, else 422 `variant_required`; adds stock, refreshes summary; a different cost updates the variant cost from today with a price row), `GET /products/:id/batches` (quantity > 0, expiry order), `POST /products/:id/clear-expired` (locks the product's expired batches `FOR UPDATE`, zeroes them, subtracts stock, writes write-offs and one expense; nothing expired → `{quantity: 0, cost: 0}`), `GET /products/expiry-summary`, list filter `expiry=expired|soon`.
- Product DTO: `expiredStock`/`expiredCost` per product and variant from one aggregate query over the page's products.
- Tests: 401s; receive 200 strips → stock +200, batch listed; receive on an untracked product 422; clear-expired → stock −60, write-off row, expense "Expired stock" ৳480 in this month's `/profit/summary` other expenses; `clearing twice clears once`; expiry-summary counts; foreign product 404 on all routes; payload keys.

### Task 3: Orders take stock FEFO
**Files:** `products.service.ts` (`variantsForOrder` adds `tracksBatches`, fresh/expired stock), `ProductsService.allocateBatches(businessId, lines, today, tx)` / `restoreBatches(allocations, tx)`; `orders.service.ts` (`buildItems` allocation + unitCost, `moveStock` callers restore allocations), `orders.presenter.ts`, `orders.errors.ts` (`stockExpired(name, i)` 422 `stock_expired`). Test: `apps/api/test/orders-batches.e2e-spec.ts`.
- Allocation happens when the order holds stock (status in `holdsStock`); a `new` order created as cancelled holds none. Batches locked `FOR UPDATE` in id order.
- Tests: `sells 150 strips FEFO (spec 5.4)` → line unitCost 926, productCost 138900, NP2604 0, NP2611 170; `refuses an all-expired variant`; `cancelling restores the same batches`; `editing an order re-allocates batches`; `returned restores batches`; untracked products unchanged.

### Task 4: Web
**Files:** product form (tracking checkbox in `BasicFields`, stock field replaced by "Use Receive stock after saving" when tracked), `products/[id]/` (`BatchesCard.tsx`: batch table with expiry warnings, `ReceiveStockDialog.tsx`, Clear stock), `products/page.tsx` (Expired badge + `ClearStockButton.tsx` + filter "Expired"/"Expiring soon"), `ProductPicker` (hide all-expired variants, show fresh stock), `orders/[id]` (batch line under an item), dashboard expiry alert linking to `/products?expiry=expired`. Tests beside files; Playwright `e2e/batches.spec.ts` (Medical seller: create Napa, receive two batches, order 150 strips, check cost ৳1,389 on the order; an expired batch shows Clear stock and clears).

### Task 5: Docs and verification
CLAUDE.md Products paragraph (batches, FEFO, clear stock, write-off expense), spec status, `npm run check`, all Playwright.
