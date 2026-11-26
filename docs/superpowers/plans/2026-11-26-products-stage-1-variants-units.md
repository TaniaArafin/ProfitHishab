# Products for every business — Stage 1 (variants, units, details) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every product gets a unit (piece, kg, litre…), optional details (brand, description, attributes), and optional variants (up to 3 options such as Size and Colour), each variant with its own SKU, price, cost and stock. Orders, import, stock and profit work per variant, and decimal quantities work for weight, volume and length units.

**Architecture:** A new `product_variants` table holds what is sold and counted; every product has at least one variant (a plain product has one hidden variant with no option values). `products` keeps `sku`, `sellingPrice`, `costPrice` and `stock` as a summary (single variant: the same values; several variants: the first variant's price and cost, the sum of stock), kept in sync by `ProductsService` in the same transaction, so lists, search, missing cost and reports keep working. Order lines keep `productId` and add `variantId` and a `variantLabel` snapshot. Price history moves to variants. Quantities and stock become `double precision`; every money amount is rounded to whole poisha per line.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Zod (`@ph/shared`), Next.js App Router, shadcn/ui, Jest + supertest, Vitest, Playwright.

**Spec:** [docs/superpowers/specs/2026-11-25-products-for-every-business-design.md](../specs/2026-11-25-products-for-every-business-design.md), sections 4, 5.1, 5.3, 5.6, 6, 7, 8, 9, 10, 11 and stage 1 of section 12. Rules: [CLAUDE.md](../../../CLAUDE.md).

## Global Constraints

- Never commit; the owner commits. Run `npm run check` before finishing each task; `npm run test:e2e` when a user flow changes.
- Units, exactly: `piece | kg | gram | litre | ml | metre | pack | box | strip | dozen | pair | set`. Decimal quantities only for `kg | gram | litre | ml | metre`; at most 3 decimals; quantity > 0.
- Options: at most 3 per product; option names and values trimmed, 1–40 characters, values unique within an option (case-insensitive); at most 50 values per option and 250 variants per product.
- Money stays integer poisha. Line total = `Math.round(quantity × unitPrice)`, line cost = `Math.round(quantity × unitCost)`. The same rounding in `orderTotals()`, the API and the profit calculator.
- Business types, exactly: `Clothing & fashion`, `Cosmetics & beauty`, `Food & grocery`, `Electronics & gadgets`, `Medical & pharmacy`, `Home & lifestyle`, `Other`.
- A plain product (no options) must look and behave as today: one price, cost, stock and SKU on the form; the word "variant" never shows.
- Past orders, past profit and past imports must not change. Existing API payloads (`POST /products` with `sku/sellingPrice/costPrice/stock`, order items with `productId`) keep working.
- Every status-like column gets a `CHECK` (`unit`, variant `status`); every new tenant-owned table gets a case in the cross-tenant test in `apps/api/test/app.e2e-spec.ts`.
- UI uses `components/ui/*`, `SelectField`, colours from `lib/theme-colors.ts`, and works from 360 px to 1920 px.
- Stage 2 (batches, expiry) and Stage 3 (serial, IMEI, warranty) are out of scope; do not add their tables.

## Review Focus

1. **Migration parity:** after the migration, every existing product has exactly one variant, every order line and price row points at it, and every report (dashboard, monthly profit, product profit) shows the same numbers as before. → Task 2 step "parity check" against the dev database.
2. **Removing a variant that has orders:** dropping "XL" from a product that sold XL must not delete history; the variant is archived and old orders still show "XL". → Task 3 test `archives a dropped variant that has orders`.
3. **Fractional money:** 0.333 kg × ৳77.77 must round to whole poisha the same way on the order form, in the stored order and in profit. → Task 1 test `rounds each line to whole poisha`, Task 5 test `stores the rounded line total`.
4. **A plain-product API client** (old payloads with `productId` on order items): must keep working for single-variant products and get a clear 422 for multi-variant products. → Task 5 test `productId still works for a plain product`.
5. **Whole-number units:** `1.5` of a piece product must be refused on the order form, by the API and in import, with a message naming the product and its unit. → Task 5 test `refuses a decimal quantity for a piece product` and Task 7 test for `Gift Box, 1.5`.

---

## File structure

| Area | Files |
|---|---|
| Shared rules | `packages/shared/src/products.ts` (new: units, business types, defaults, variant helpers), `schemas.ts`, `types.ts`, `order-totals.ts`, `index.ts`, `shared.test.ts` |
| Database | `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/<ts>_product_variants/migration.sql` |
| Products API | `modules/products/variants.repository.ts` (new), `option-lists.repository.ts` (new), `products.service.ts`, `products.repository.ts`, `product-prices.repository.ts`, `products.presenter.ts`, `products.controller.ts`, `option-lists.controller.ts` (new), `products.errors.ts`, `products.module.ts` |
| Orders API | `modules/orders/orders.service.ts`, `orders.repository.ts`, `orders.presenter.ts`, `orders.errors.ts` |
| Profit / reports | `modules/profit/profit.repository.ts`, `profit.calculator.ts`, `profit.service.ts` |
| Import | `packages/shared/src/enums.ts` (targets), `modules/imports/rules/row-parse.ts`, `header-match.ts`, `imports.service.ts`, `products.service.ts` (`resolveForImport`) |
| Business | `modules/business/business.service.ts` (seed option lists at registration via `ProductsService.seedOptionLists`) |
| Web | `app/(app)/products/ProductForm.tsx` split into `products/form/{BasicFields,VariantsSection,MoreOptions}.tsx`, `products/page.tsx`, `products/[id]/page.tsx`, `components/PriceHistory.tsx`, `components/ProductPicker.tsx`, `orders/new/{LineItems,OrderForm,OrderSummary}.tsx`, `orders/[id]` detail, `reports/products/page.tsx`, `settings/options/page.tsx` + `SettingsNav.tsx`, `settings/business/BusinessDetailsForm.tsx`, `(auth)/register/RegisterForm.tsx` |
| Tests | `apps/api/test/products-variants.e2e-spec.ts` (new), `orders-variants.e2e-spec.ts` (new), `option-lists.e2e-spec.ts` (new), updates to `app.e2e-spec.ts`, `imports.e2e-spec.ts`; web component tests beside files; `apps/web/e2e/variants.spec.ts` (new) |

---

### Task 1: Shared rules — units, business types, defaults, variant helpers, schemas, rounding

**Files:** Create `packages/shared/src/products.ts`. Modify `schemas.ts`, `types.ts`, `order-totals.ts`, `index.ts`, `shared.test.ts`.

**Interfaces (Produces):**
- `UNITS` (tuple above), `type Unit`, `DECIMAL_UNITS: ReadonlySet<Unit>`, `UNIT_LABELS: Record<Unit, string>` (`kg` → "kg", `piece` → "piece", `litre` → "litre"…), `allowsDecimal(unit: Unit): boolean`.
- `BUSINESS_TYPES` (tuple above), `type BusinessType`, `businessTypeDefaults(type: string | null): { unit: Unit; options: string[]; attributes: string[] }` with exactly the spec section 6 table (unit, suggested option names, suggested attribute labels; `Medical & pharmacy` → unit `strip`, attributes `Generic name, Strength, Form`; unknown or null → `piece`, none).
- `PRESET_OPTION_LISTS: Record<BusinessType, Array<{ name: string; values: string[] }>>`: Clothing → Size `S, M, L, XL, XXL` and Colour `Red, Blue, Black, White, Green`; Cosmetics → Shade (empty values, seller fills); Grocery → Pack size `250 g, 500 g, 1 kg, 1 litre, 5 litre`; Electronics → Storage `4/64, 6/128, 8/128, 8/256` and Colour; others → none.
- `variantCombinations(options: Array<{ name: string; values: string[] }>): Array<Record<string, string>>` — cartesian product in option and value order; `[]` options → `[{}]`.
- `variantLabel(optionValues: Record<string, string>, options: Array<{ name: string }>): string` — values joined by `" / "` in option order; `{}` → `""`.
- `suggestVariantSku(productSku: string, optionValues: Record<string, string>, options): string` — `PRODUCTSKU-VAL1-VAL2`, values upper-cased, non `[A-Z0-9]` runs → `-`, trimmed of `-`, max 60 chars.
- `roundQuantity(q: number): number` (3 decimals), `lineAmount(quantity: number, unit: number): number` = `Math.round(quantity * unit)`.
- Schemas: `productOptionSchema {name, values[]}`, `productAttributeSchema {label, value}` (≤ 20), `variantInputSchema {id?: uuid, optionValues: Record<string,string>, sku?: string|null, sellingPrice: money, costPrice: money, stock: quantityLike (≥ -1e9, ≤ 3 decimals), status: 'active'|'archived' default 'active'}`; `productSchema` now has `unit` (default `piece`), `brand?`, `description?` (≤ 1000), `attributes` (default `[]`), `options` (default `[]`, ≤ 3), `variants?` (1–250); the legacy top-level `sku, sellingPrice, costPrice, stock` stay **optional**, and a `.transform` builds `variants: [{ optionValues: {}, sku, sellingPrice, costPrice, stock }]` when `variants` is absent; a `.superRefine` checks: either variants or legacy price fields; every variant's `optionValues` keys equal the option names and values are among that option's values; no two variants with the same option values; no options ⇒ exactly one variant with `{}`. `productUpdateSchema` = the same object `.partial()` with the same refinements when `options`/`variants` are present.
- `orderItemSchema`: `variantId?: uuid`, `productId?: uuid` (refine: exactly one), `quantity: z.number().positive('Quantity must be more than 0')` with ≤ 3 decimals (`'Use at most 3 decimals'`), `unitPrice?`.
- `businessUpdateSchema.businessType`: `z.enum(BUSINESS_TYPES).nullable().optional()` but still accepts an existing free-text value unchanged (use `z.string().trim().max(60)` and validate against `BUSINESS_TYPES` only in the web form, to keep old data valid).
- Types: `ProductDto` gains `unit: Unit`, `brand: string|null`, `description: string|null`, `attributes: {label,value}[]`, `options: {name, values}[]`, `variants: VariantDto[]`; `VariantDto { id, optionValues, label, sku, sellingPrice, costPrice, stock, status }`. `OrderItemDto` gains `variantId`, `variantLabel: string|null`, `unit: Unit`. `ProductPriceDto` gains `variantId`, `variantLabel`. `ProductPriceOnDto` becomes `{ variantId, sellingPrice, costPrice }`. `ProductProfitDto` gains `variants: Array<{ variantId, label, unitsSold, sales, cost, profit, margin }>` (empty for plain products). `OptionListDto { id, name, values }`.
- `orderTotals()` uses `lineAmount` for subtotal and product cost.

- [ ] **Step 1: Write failing tests** in `shared.test.ts`:
  - `variantCombinations([{name:'Size',values:['S','M']},{name:'Colour',values:['Red','Blue']}])` equals `[{Size:'S',Colour:'Red'},{Size:'S',Colour:'Blue'},{Size:'M',Colour:'Red'},{Size:'M',Colour:'Blue'}]`; `variantCombinations([])` equals `[{}]`.
  - `variantLabel({Size:'M',Colour:'Red'}, [{name:'Size'},{name:'Colour'}])` is `'M / Red'`.
  - `suggestVariantSku('KUR', {Size:'XL',Colour:'Sky blue'}, opts)` is `'KUR-XL-SKY-BLUE'`.
  - `rounds each line to whole poisha`: `orderTotals([{quantity:0.333, unitPrice:7777, unitCost:6000}], {discount:0, deliveryCharge:0})` gives `subtotal 2590`, `productCost 1998`; and `[{quantity:2.5,unitPrice:7800,unitCost:6600}]` gives `subtotal 19500`, `productCost 16500` (spec 5.3).
  - `allowsDecimal('kg')` true, `allowsDecimal('piece')` false; `businessTypeDefaults('Clothing & fashion')` equals `{ unit:'piece', options:['Size','Colour'], attributes:['Material','Fit'] }`; `businessTypeDefaults(null).unit` is `'piece'`.
  - `productSchema` legacy: parsing `{ name:'Gift Box', sellingPrice:35000, costPrice:12000, stock:40 }` yields `variants: [{ optionValues:{}, sku: null, sellingPrice:35000, costPrice:12000, stock:40, status:'active' }]` and `unit:'piece'`.
  - `productSchema` refuses: a variant missing an option, a value not in its option, two variants with the same values, 4 options, options with no variants (each with a field path, e.g. `variants.1.optionValues`).
  - `orderItemSchema` refuses both/neither of `variantId`/`productId`, `quantity: 0`, `quantity: 1.2345`; accepts `2.5`.
- [ ] **Step 2:** `npx vitest run` in `packages/shared`. Expected: FAIL (missing exports).
- [ ] **Step 3:** Implement `products.ts`, the schema and type changes, and `lineAmount` in `orderTotals`; export from `index.ts`.
- [ ] **Step 4:** `npx vitest run` in `packages/shared`, then `npm run build:shared`. Expected: PASS.

---

### Task 2: Database — variants table, units, decimal quantities, option lists, backfill

**Files:** `apps/api/prisma/schema.prisma`; new migration `apps/api/prisma/migrations/<timestamp>_product_variants/migration.sql`.

**Interfaces (Produces):**
- `Product` + `unit String @default("piece")`, `brand String?`, `description String?`, `attributes Json @default("[]")`, `options Json @default("[]")`; `stock` becomes `Float`; relation `variants ProductVariant[]`.
- `ProductVariant { id, businessId, productId, optionValues Json @default("{}"), position Int, sku String, sellingPrice Int, costPrice Int, stock Float @default(0), status String @default("active"), importId String?, createdAt, updatedAt }`, `@@unique([businessId, sku])`, `@@index([productId])`, FK product `onDelete: Cascade`, business `Cascade`.
- `OrderItem` + `variantId String @db.Uuid` (FK `Restrict`), `variantLabel String?`; `quantity Float`.
- `ProductPrice` + `variantId String @db.Uuid` (FK `Cascade`); unique moves from `[productId, effectiveFrom]` to `[variantId, effectiveFrom]`.
- `OptionList { id, businessId, name, values Json, createdAt, updatedAt }`, `@@unique([businessId, name])`.

- [ ] **Step 1:** Edit `schema.prisma` as above. Generate SQL with `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <shadow> --script`, then hand-edit the migration so it runs on live data in this order: (1) create `product_variants` and `option_lists`; (2) add new nullable columns; (3) `INSERT INTO product_variants (id, businessId, productId, position, sku, sellingPrice, costPrice, stock, status, importId, …) SELECT gen_random_uuid(), …, 0, sku, sellingPrice, costPrice, stock, status, importId FROM products`; (4) `UPDATE order_items SET variantId = v.id FROM product_variants v WHERE v.productId = order_items.productId` and the same for `product_prices`; (5) set `variantId` NOT NULL on both; (6) swap the `product_prices` unique; (7) `ALTER … TYPE double precision` for `products.stock`, `product_variants.stock`, `order_items.quantity`; (8) checks: `products_unit_check` (the 12 units), `product_variants_status_check` (`active|archived`), `order_items_quantity_check` (`quantity > 0`), `product_variants_money_check` (prices ≥ 0); (9) seed `option_lists` for existing businesses from `businessType` with the `PRESET_OPTION_LISTS` values (literal SQL `INSERT … SELECT … WHERE "businessType" = 'Clothing & fashion'`, one statement per type).
- [ ] **Step 2:** Before applying, capture a **parity snapshot** of the dev database with a scratch script (not committed) that, for every business, saves `GET /reports/monthly-profit` (last 12 months), `/profit/products?period=…` over each month with orders, and `/orders` totals to JSON.
- [ ] **Step 3:** `npx prisma migrate deploy` on dev and test databases; `npx prisma generate`.
- [ ] **Step 4: Parity check.** Re-run the snapshot script after Tasks 3–6 are done (the API reads variants by then) and diff: expected no differences. Also SQL: `SELECT count(*) FROM products p WHERE (SELECT count(*) FROM product_variants v WHERE v."productId" = p.id) <> 1` → `0`; `SELECT count(*) FROM order_items WHERE "variantId" IS NULL` → `0`.
- [ ] **Step 5:** Add `product_variants` and `option_lists` to the TRUNCATE in `test/helpers.ts`.

---

### Task 3: Products API — create, update, show and list with variants; price history per variant

**Files:** Create `modules/products/variants.repository.ts`. Modify `products.service.ts`, `products.repository.ts`, `product-prices.repository.ts`, `products.presenter.ts`, `products.errors.ts`, `products.module.ts`. Test: create `apps/api/test/products-variants.e2e-spec.ts`; extend `app.e2e-spec.ts` cross-tenant case.

**Interfaces:**
- Consumes Task 1 schemas and types, Task 2 tables.
- `VariantsRepository`: `forProducts(businessId, productIds, db?) → VariantRow[]` (ordered by `position`), `findMany(businessId, variantIds, db?)`, `skusTaken(businessId, skus, exceptIds) → Set<string>`, `upsertForProduct(businessId, productId, variants: Array<VariantWrite>, db)`, `archive(variantIds, db)`, `hasOrders(variantIds, db) → Set<string>`, `adjustStock(deltas: Map<variantId, number>, db)` (one statement, as `ProductsRepository.adjustStock`), `refreshProductSummary(productIds, db)` (one `UPDATE products SET sku/sellingPrice/costPrice = first active variant by position, stock = sum(stock of active variants)`).
- `ProductPricesRepository`: methods keyed by variant: `record(businessId, productId, variantId, point, date, userId, db)`, `on(businessId, variantIds, date, db?) → Map<variantId, PricePoint>`, `history(businessId, productId) → PriceHistoryRow[]` with `variantId, variantLabel`.
- `ProductsService.create/update` accept the parsed `ProductInput`; plain products: variant SKU = product SKU (generated `PRD-xxxx` as today when absent); multi-variant products: product SKU from input or generated, each variant SKU from input or `suggestVariantSku`. Update: a variant with an `id` is updated; without an `id` is created; an existing variant left out is **archived** if it has orders, deleted otherwise. A variant's price/cost change writes a price row for that variant effective today. Product summary refreshed in the same transaction. Search re-indexed after commit (as today).
- Errors (`ProductError`): `variantSkuTaken(sku)` 409 `sku_taken` with field `variants.<i>.sku`; `variantNotFound()` 404; existing `skuTaken` unchanged for the product SKU.
- `bulkCost`: sets the cost of every active variant of the product whose cost is 0 (and records their price rows); `missingCost` lists products with any active variant cost 0 (unchanged shape).
- `GET /products/prices-on?variantIds=…&date=…` (replaces `ids`; `ids` still accepted and mapped to each product's first variant) → `ProductPriceOnDto[]`.

- [ ] **Step 1: Write failing e2e tests** (`products-variants.e2e-spec.ts`), each also asserting 401 anonymous where it adds a route:
  - `creates a plain product from the legacy payload with one hidden variant`: `POST /products {name:'Gift Box', sellingPrice:35000, costPrice:12000, stock:40}` → `variants.length 1`, `variants[0].label ''`, `variants[0].sku === data.sku`, `unit 'piece'`.
  - `creates Cotton Kurti with 8 variants (spec 5.1)`: options Size `S,M,L,XL` × Colour `Red,Blue`, XL price 135000 cost 76000, others 125000/70000; → 8 variants in combination order, labels `'S / Red'…`, SKUs suggested `KUR-S-RED` when product SKU `KUR`; product `stock` = sum; product `sellingPrice` = first variant's.
  - `refuses a taken variant SKU` (409, field `variants.2.sku`), including a SKU used by another product's variant.
  - `archives a dropped variant that has orders`: create order with XL/Red, then PATCH options without XL → XL/Red variants `status 'archived'`, the order still shows `variantLabel 'XL / Red'`; a dropped variant without orders is gone.
  - `records price history per variant`: change M/Red price → `GET /products/:id/prices` has a row with `variantLabel 'M / Red'`; other variants unchanged.
  - `prices-on by variant`: returns the price of each variant on a past date.
  - Payload shape: `Object.keys(variant)` exactly `['costPrice','id','label','optionValues','sellingPrice','sku','status','stock']` (sorted).
  - Cross-tenant (`app.e2e-spec.ts`): business B cannot see A's variants through `/products/:id`, `/products/prices-on?variantIds=`, nor use A's `variantId` on an order (404).
- [ ] **Step 2:** Run `npx jest --runInBand test/products-variants test/app.e2e-spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the repository, service, presenter (`toProductDto(row, variants)`) and controller changes.
- [ ] **Step 4:** Run the same tests plus `test/price-history.e2e-spec.ts` and `test/product-search.e2e-spec.ts`. Expected: PASS (existing tests unchanged).

---

### Task 4: Option lists API, seeding, and business-type defaults

**Files:** Create `modules/products/option-lists.repository.ts`, `option-lists.controller.ts`; modify `products.module.ts`, `products.service.ts` (`seedOptionLists`), `modules/business/business.service.ts` (call during `createForOwner`), `auth.service.ts` if the call belongs in registration's transaction. Test: `apps/api/test/option-lists.e2e-spec.ts`; cross-tenant case in `app.e2e-spec.ts`.

**Interfaces:**
- Routes: `GET /option-lists` → `OptionListDto[]` ordered by name; `POST /option-lists {name, values}`; `PATCH /option-lists/:id {name?, values?}`; `DELETE /option-lists/:id` → 204. Name unique per business (409 `option_list_taken`), values as in Global Constraints.
- `ProductsService.seedOptionLists(businessId, businessType: string | null, db: Tx)` inserts `PRESET_OPTION_LISTS[businessType]` (skips existing names). Exported on the module; added to CLAUDE.md's public surfaces.

- [ ] **Step 1: Failing tests:** 401 anonymous on each route; a new **Clothing** seller sees `Colour` and `Size` lists right after registering; an **Other** seller sees none; create/rename/delete; 409 on a duplicate name; another business's list id → 404 on PATCH/DELETE; values trimmed and de-duplicated.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.

---

### Task 5: Orders per variant with decimal quantities

**Files:** `modules/orders/orders.service.ts`, `orders.repository.ts`, `orders.presenter.ts`, `orders.errors.ts`; `ProductsService.productsForOrder` → `variantsForOrder`, `moveStock` per variant. Test: create `apps/api/test/orders-variants.e2e-spec.ts`.

**Interfaces:**
- `ProductsService.variantsForOrder(businessId, refs: Array<{ variantId?: string; productId?: string }>, orderDate, db) → Map<string /* ref key */, VariantForOrder>` where `VariantForOrder = { variantId, productId, productName, variantLabel: string | null, sku, unit: Unit, archived: boolean, sellingPrice, costPrice }`; a `productId` ref resolves to the product's only active variant, or throws `OrderError.variantRequired(productName)` (422, field `items.<i>.variantId`) when it has more than one.
- `ProductsService.moveStock(lines: Array<{ variantId: string; quantity: number }>, direction, db)` adjusts variant stock and refreshes the product summary.
- `OrderError.wholeQuantityRequired(productName, unit)` 422 `quantity_not_whole`, message `"<productName> is sold by <unit>; use a whole number."`, field `items.<i>.quantity`.
- Order line snapshot: `variantId`, `variantLabel` (null for a plain product), `quantity`, `lineTotal = lineAmount(quantity, unitPrice)`; `productCost` from `orderTotals`. Editing an order matches existing lines by `variantId` (was `productId`).
- `OrderItemDto` includes `variantId`, `variantLabel`, `unit`.

- [ ] **Step 1: Failing tests:**
  - `sells two variants of one product (spec 5.1)`: 2 × M/Red + 1 × XL/Red → `subtotal 385000`, `productCost 216000`, M/Red stock 14→12, XL/Red 4→3, product stock decreases by 3; lines carry `variantLabel`.
  - `sells 2.5 kg of rice (spec 5.3)`: product unit `kg`, price 7800 cost 6600 stock 250 → `lineTotal 19500`, `productCost 16500`, stock `247.5`.
  - `stores the rounded line total`: 0.333 × 7777 → `lineTotal 2590`.
  - `refuses a decimal quantity for a piece product`: 1.5 of Gift Box → 422 `quantity_not_whole`, message names "Gift Box" and "piece"; nothing written.
  - `productId still works for a plain product`; `productId of a multi-variant product is 422 variant_required`.
  - `returning and cancelling restore variant stock`; `editing a line keeps its original price snapshot` (match by variant).
  - Idempotency replay unchanged (existing tests).
- [ ] **Step 2:** Run with existing `app.e2e-spec.ts` and `rules.e2e-spec.ts`. Expected: new tests FAIL; existing pass.
- [ ] **Step 3:** Implement. **Step 4:** All order tests PASS.

---

### Task 6: Profit and reports with variants and decimal quantities

**Files:** `modules/profit/profit.repository.ts` (`deliveredItems` selects `variantId`, `variantLabel`; `returnedUnits` casts `float8`), `profit.calculator.ts` (`productProfitRows` uses `lineAmount` for cost and builds `variants`), `reports.table.ts` (product profit table unchanged columns; no variant rows in exports in Stage 1). Tests: `profit.calculator.spec.ts`, `test/reports.e2e-spec.ts`.

- [ ] **Step 1: Failing tests:** calculator: two lines of the same product, different variants → one product row with `variants` `[{label:'M / Red', unitsSold:2, …}, {label:'XL / Red', unitsSold:1, …}]`, product totals equal the sum; a plain product has `variants: []`; a 0.333 × 6000 cost line counts as 1998. e2e: `/profit/products` returns the variant breakdown for the spec 5.1 order; the SRS 11.1 reference figures in `reports.e2e-spec.ts` stay exactly the same.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS. Then run the Task 2 **parity check**.

---

### Task 7: Import with variants, units and decimal quantities

**Files:** `packages/shared/src/enums.ts` (import targets + labels), `modules/imports/rules/header-match.ts`, `rules/row-parse.ts`, `rules/orders-group.ts` (if lines are keyed by product), `imports.service.ts` (`checkRows` reads units of existing products), `products.service.ts` (`resolveForImport`, new `unitsForImport`). Tests: `row-parse.spec.ts`, `header-match.spec.ts`, `test/imports.e2e-spec.ts`.

**Interfaces:**
- New optional import targets: `size` ("Size"), `colour` ("Colour"), `variant` ("Variant"), `unit` ("Unit"). Header synonyms: `size, সাইজ` → size; `color, colour, রং, রঙ` → colour; `variant, variation, option, type` → variant; `unit, uom, একক` → unit.
- `NormalizedRow` gains `optionValues: Record<string, string>` (keys `Size`, `Colour`, `Variant`, only for filled cells) and `unit: Unit | null` (unknown text → `null`, with warning `unit_unknown`).
- `parseQuantity` accepts up to 3 decimals; `checkRows` marks a row invalid with new reason `quantity_not_whole` (label "This product is sold whole; use a whole number") when its quantity has decimals and its unit (row's `unit`, else the existing product's unit, else `piece`) does not allow decimals. `rowProblems` puts it on `quantity`.
- `resolveForImport` refs gain `optionValues`, `unit`: match variant SKU first; else product (SKU or name) + identical option values among its variants; create a missing variant on an existing product (adding the option names/values it needs to the product's `options`), or a new product with those options and that variant (unit from the row, else `businessTypeDefaults(...).unit`). `importProductKey` includes the option values. Returns per key `{ productId, variantId, name, variantLabel, sku, costPrice, costOn }`.
- `dedupeHash` includes the option values (so M and L of the same product on the same day are not duplicates).

- [ ] **Step 1: Failing tests:** header match maps `Size`, `Colour`, `Unit`; `Cotton Kurti, M, Red, 2, 1250` and `Cotton Kurti, L, Red, 1, 1250` in one file import as one product with two variants; a second import of `M / Red` matches the existing variant; `Miniket Rice, kg, 2.5` imports with quantity 2.5; `Gift Box, 1.5` (existing piece product) is invalid with `quantity_not_whole` on the Qty cell; the SRS 11.1 sample file still gives 225 / 8 / 4 and ৳5,20,000; undo removes created variants with their products (and variants it added to existing products when no order uses them).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** All import tests PASS (including the 5,000-row timing tests).

---

### Task 8: Web — product form, list and detail

**Files:** split `app/(app)/products/ProductForm.tsx` into `products/form/BasicFields.tsx` (name, category, unit `SelectField`, and for a plain product price/cost/stock/SKU), `products/form/VariantsSection.tsx` (options editor: add/remove option, chips for values with add-on-Enter, "Use saved ▾" listing `GET /option-lists`, "Save as list"; variant table generated with `variantCombinations`, existing rows kept by option values, "Set all: price, cost, Apply", per-row SKU/price/cost/stock/active), `products/form/MoreOptions.tsx` (brand, description, attributes rows label/value with suggested labels from `businessTypeDefaults`). `ProductForm.tsx` keeps submit, idempotency and errors. Modify `products/page.tsx` (unit after stock, "8 variants" under the name, price shown "from ৳1,250" when variants differ), `products/[id]/page.tsx` (variant table read-only above the form), `components/PriceHistory.tsx` (variant column when any row has a label). New product form starts from `businessTypeDefaults(business.businessType)`: unit preset; option names suggested as one-click chips ("+ Size", "+ Colour").

- [ ] **Step 1: Failing component tests** (`ProductForm.test.tsx`): a plain product form shows Price/Cost/Stock and no "Variants" heading, and submits the legacy-shaped body plus `unit`; adding Size `S,M` and Colour `Red` shows 2 rows `S / Red`, `M / Red`; "Set all" fills price 1250 on both; submitting sends `options` and two `variants` in poisha; removing value `M` removes its row; "Use saved" fills Size from a mocked `/option-lists`; a 409 `sku_taken` with field `variants.1.sku` shows under that row's SKU input; choosing unit `kg` shows "Price per kg".
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement (each file ≤ ~200 lines). **Step 4:** PASS.

---

### Task 9: Web — orders, product profit, settings and sign-up

**Files:** `components/ProductPicker.tsx` (options are variants: "Cotton Kurti — M / Red", price, stock with unit; plain products show the name only), `orders/new/LineItems.tsx` (quantity input `inputMode="decimal"` and `step` 0.001 for decimal units, unit shown after the box, client check "use a whole number" for piece units), `orders/new/OrderForm.tsx` (line key = `variantId`; `prices-on?variantIds=`), `orders/[id]` detail (label and unit on each line), `reports/products/page.tsx` (expand a product row to its variants), `settings/SettingsNav.tsx` + new `settings/options/page.tsx` (`Product options` tab: list, add, edit values as chips, delete with `AlertDialog`), `settings/business/BusinessDetailsForm.tsx` (business type `SelectField` with `BUSINESS_TYPES`), `(auth)/register/RegisterForm.tsx` (uses `BUSINESS_TYPES`, includes Medical & pharmacy). E2E: create `apps/web/e2e/variants.spec.ts`.

- [ ] **Step 1: Failing component tests:** picker lists `Cotton Kurti — M / Red` and picking it adds a line with that `variantId`; a kg line accepts `2.5` and shows "kg"; a piece line with `1.5` shows "Use a whole number" and blocks submit; the order summary shows ৳195 for 2.5 × ৳78; the product-profit row expands to its variants; the options settings page adds and deletes a list.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5: Playwright `variants.spec.ts`** (desktop and phone): register a Clothing seller, create Cotton Kurti with Size S/M × Colour Red using a saved list, set prices, create an order for 2 × M/Red, check the order shows "M / Red" and the product's M/Red stock dropped by 2; create Miniket Rice (kg) and order 2.5 kg, total ৳195. Then run all Playwright specs (`--workers=1`).

---

### Task 10: Docs and final verification

- [ ] **Step 1:** CLAUDE.md: a **Products** paragraph (variants, summary fields on `products`, units and decimal quantities, rounding rule, option lists, business-type defaults, `seedOptionLists`/`variantsForOrder` in public surfaces, cross-tenant cases); update the Import paragraph (new targets, `quantity_not_whole`, variant matching). README: nothing to configure.
- [ ] **Step 2:** Spec status line → "Stage 1 built; Stages 2–3 not started".
- [ ] **Step 3:** `npm run check` and `npm run test:e2e`; report counts; re-run the Task 2 parity diff and report it.
