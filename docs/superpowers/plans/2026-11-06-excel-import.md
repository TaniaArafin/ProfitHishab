# Excel / CSV Order Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A seller uploads an Excel or CSV file of past orders, corrects the column and status mapping, previews valid, duplicate and invalid rows, and imports the valid ones in one transaction. They can undo the import later.

**Architecture:**
- A new Nest module `modules/imports` owns `imports`, `import_rows` and a new `import_mappings` table.
- Parsing is done once at upload with SheetJS. Raw rows go into `import_rows`; the file is not kept.
- Pure rules (header matching, status matching, row parsing, dedupe hashing, grouping into orders) live in `modules/imports/rules/` with unit tests.
- Commit and undo write orders, customers and products only through new batch methods on `OrdersService`, `CustomersService`, `ProductsService` and `BusinessService`, passing one `Tx`.
- Web: `/imports` (history), `/imports/new` (upload) and `/imports/[id]` (mapping → statuses → preview → result) as client leaves inside server pages.

**Tech Stack:**
- NestJS 11, Prisma 6, PostgreSQL 16.
- SheetJS `xlsx` 0.20.3 from the official tarball. The npm registry copy, 0.18.5, has unpatched advisories.
- multer, through `@nestjs/platform-express`.
- Next.js 15, shadcn/ui, Vitest, Playwright.

**Spec:**
- [SRS.md](../../../SRS.md): §5.7 FR-IMP-01–13, §7.1 `imports`/`import_rows`, §8.2 Imports endpoints, §9 `/imports*` screens, §11.1 items 2–4.
- [CLAUDE.md](../../../CLAUDE.md) for layering.
- Roadmap: [2026-11-06-profithishab-roadmap.md](2026-11-06-profithishab-roadmap.md).

## Global Constraints

- Files: `.xlsx`, `.xls`, `.csv`. Max 5 MB and 5,000 data rows. First sheet only. The first non-empty row is the header (FR-IMP-01).
- Required targets: `phone`, `product`, `quantity`, `sellingPrice`.
- Optional targets: `customerName`, `address`, `orderDate`, `externalRef`, `sku`, `productCost`, `discount`, `deliveryCharge`, `courier`, `courierCost`, `paymentMethod`, `status` (FR-IMP-02).
- No status column: every row is `delivered` (FR-IMP-04).
- Dates accept `DD/MM/YYYY`, `DD-MM-YYYY`, `YYYY-MM-DD` and Excel serials. A missing date uses the import date (Asia/Dhaka) plus the warning `date_missing` (FR-IMP-05).
- Invalid reasons, exactly: `phone_invalid`, `product_missing`, `quantity_invalid` (< 1 or not an integer), `price_invalid`, `date_invalid`.
- Duplicate: `externalRef` matches an order's `external_ref` in this business. With no order ID: sha256 of `phone|orderDate|productKey|quantity|unitPrice` matches `orders.dedupeHash` or an earlier row of the same file (FR-IMP-06).
- Product match: SKU first, then the exact name, trimmed and case-insensitive. Unmatched products are created with the row's price and cost. Cost 0 when there is no cost column (FR-IMP-08).
- Commit is one transaction (FR-IMP-10).
  - Orders get `source='import'` and `importId`.
  - Imported orders do **not** move stock (FR-PROD-07).
  - Each order gets one `order_status_history` row (`fromStatus` null).
  - `delivered_at`/`returned_at` are set to the order date when the status is `delivered`/`returned`.
- Undo deletes exactly that import's orders, plus customers and products with that `importId` that have no other orders (FR-IMP-12).
- Performance: 5,000 rows go from validate through commit in under 20 s (FR-IMP-13).
  - Batch statements only. No per-row queries inside the transaction.
- CSV downloads are UTF-8 with a BOM (`﻿`).
- Money is poisha. Amount cells accept `৳`, `Tk`, `BDT`, commas, spaces and Bangla digits.
- Import is a write, so after the trial it gets 402, like every other write.
- Never commit; the user commits.

## Review Focus

1. **An Excel phone cell stored as a number** (`1712345678`, leading 0 lost) must import as `01712345678`. `normalizePhone` already handles 10 digits; the test is in Task 3.
2. **The same order ID on two rows with different phone numbers.** Expect both rows to be invalid with `order_conflict`. Never one order for two customers. Test in Task 3 (`groupOrders`).
3. **Double-clicking "Import 225 Orders", or two tabs.** The second commit is a 409 `import_not_ready` and creates no extra orders. Test in Task 7.
4. **Amounts like `৳ 1,250`, `1250 Tk`, `১২৫০` and `1250.5`.** They parse to `125000`, `125000`, `125000` and `125050`. Negative amounts or text are `price_invalid`. Test in Task 3.
5. **A file with title rows above the header and blank rows in the middle.** The header is the first non-empty row; blank data rows are skipped, not counted as invalid. Test in Task 4.

---

## File structure

```
packages/shared/src/
  enums.ts            + IMPORT_STATUSES, IMPORT_ROW_STATUSES, IMPORT_TARGETS, REQUIRED_IMPORT_TARGETS, IMPORT_ROW_REASONS
  schemas.ts          + importMappingSchema, importRowsQuerySchema
  types.ts            + ImportDto, ImportListItemDto, ImportRowDto, ImportCommitResultDto, ImportUndoResultDto
apps/api/prisma/migrations/20261112090000_imports/migration.sql
apps/api/src/common/csv.ts                       toCsv(): BOM + RFC 4180 (Phase 2 reuses it)
apps/api/src/modules/imports/
  imports.module.ts  imports.controller.ts  imports.service.ts  imports.errors.ts  imports.presenter.ts
  imports.repository.ts          imports + import_rows
  import-mappings.repository.ts  saved mappings per business + header key
  spreadsheet.ts                 buffer → { headers, rows }, kind sniffing, limits
  template.ts                    builds the sample template.xlsx
  rules/header-match.ts   rules/status-match.ts   rules/row-parse.ts   rules/orders-group.ts
  rules/*.spec.ts
apps/api/src/modules/{business,customers,products,orders}/   + batch methods for import (Task 7–8)
apps/api/test/imports.e2e-spec.ts
apps/api/test/fixtures/make-sample-orders.ts      deterministic 237-row fixture builder
apps/web/app/(app)/imports/page.tsx  ImportHistory.tsx
apps/web/app/(app)/imports/new/page.tsx  UploadStep.tsx
apps/web/app/(app)/imports/[id]/page.tsx  ImportWizard.tsx  MappingStep.tsx  StatusStep.tsx  PreviewStep.tsx  ResultStep.tsx
apps/web/app/(app)/imports/[id]/ImportWizard.test.tsx
apps/web/lib/client-api.ts      + upload()
apps/web/e2e/import.spec.ts
```

---

### Task 1: Shared contract

**Files:**
- Modify: `packages/shared/src/enums.ts`, `schemas.ts`, `types.ts`
- Test: `packages/shared/src/shared.test.ts`

**Interfaces:**
- Produces (enums):
  - `IMPORT_STATUSES = ['uploaded','mapped','validated','imported','undone','failed'] as const`
  - `IMPORT_ROW_STATUSES = ['pending','valid','duplicate','invalid'] as const`
  - `IMPORT_TARGETS`: the 16 targets in Global Constraints.
  - `REQUIRED_IMPORT_TARGETS = ['phone','product','quantity','sellingPrice'] as const`
  - `IMPORT_ROW_REASONS`: the five invalid reasons plus `'order_conflict'`, `'duplicate_ref'`, `'duplicate_row'`, `'duplicate_in_file'`.
  - `IMPORT_ROW_WARNINGS = ['date_missing','cost_missing','discount_clamped'] as const`
  - `type ImportMapping = z.infer<typeof importMappingSchema>` (Task 3 and Task 6 use it).
  - Types: `ImportStatus`, `ImportRowStatus`, `ImportTarget`, `ImportRowReason`.
- Produces (schemas):
  - `importMappingSchema = z.object({ columns: z.record(z.enum(IMPORT_TARGETS), z.string().min(1)), statuses: z.record(z.string(), z.enum(ORDER_STATUSES)).default({}) })`, refined so every required target is present. The error path is `columns.<target>` with the message `Choose the column for <label>.`.
  - `importRowsQuerySchema`: `page`, `perPage` (≤ 100, default 25), `status` (an optional `ImportRowStatus`).
- Produces (types):
  - `ImportDto { id, fileName, status, createdAt, headers: string[], sampleRows: Record<string,string>[] (first 5), mapping: ImportMapping | null, suggestedColumns: Partial<Record<ImportTarget,string>>, statusValues: { value: string; count: number; suggested: OrderStatus | null }[], counts: { total, valid, duplicate, invalid, orders }, importedOrders: number, missingCostProducts: number }`
  - `ImportListItemDto { id, fileName, status, createdAt, importedOrders, canUndo: boolean }`
  - `ImportRowDto { rowNumber, status, reasons: ImportRowReason[], warnings: string[], raw: Record<string,string> }`
  - `ImportCommitResultDto { ordersCreated, customersCreated, productsCreated, missingCostProducts, from: string, to: string }`
  - `ImportUndoResultDto { ordersDeleted, customersDeleted, productsDeleted }`

- [ ] **Step 1: Write failing tests** in `shared.test.ts`:
  - `importMappingSchema accepts the four required columns and defaults statuses to {}`.
  - `importMappingSchema rejects a mapping without quantity, with fields['columns.quantity']`.
  - `importRowsQuerySchema caps perPage at 100`.
- [ ] **Step 2:** Run `npm test -w @ph/shared`. Expected: FAIL (exports missing).
- [ ] **Step 3:** Add the enums, schemas and types above. Labels for the error message come from a new `IMPORT_TARGET_LABELS: Record<ImportTarget,string>` (`sellingPrice: 'Selling price'`, `externalRef: 'Order ID'`, and so on).
- [ ] **Step 4:** Run `npm test -w @ph/shared`. Expected: PASS.
- [ ] **Step 5:** Stop. The user commits.

### Task 2: Migration and repositories

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20261112090000_imports/migration.sql`, `modules/imports/imports.repository.ts`, `import-mappings.repository.ts`
- Test: `apps/api/test/imports.e2e-spec.ts` (DB section)

**Schema changes:**
- `imports`: add `headers JSONB NOT NULL DEFAULT '[]'` and `headersKey TEXT`.
  - CHECKs: `status IN (IMPORT_STATUSES)` and `type IN ('orders','products')`.
  - Counters `>= 0`.
  - Index `(businessId, createdAt)` (exists).
- `import_rows`: CHECK `status IN (IMPORT_ROW_STATUSES)`. Add `groupKey TEXT`, the order it will belong to.
- New `import_mappings`:
  - Columns: `id` uuid, `businessId` FK CASCADE, `headersKey TEXT`, `mapping JSONB`, `updatedAt`.
  - `UNIQUE(businessId, headersKey)`.
- `headersKey` = sha256 of the headers, trimmed, lowercased, sorted and joined with `\u0001`.

**Interfaces (Produces):**
- `ImportsRepository`:
  - `create(businessId, { fileName, headers, headersKey, createdById }, rows: {rowNumber, raw}[], tx): Promise<string>`. Inserts rows with `createMany` in chunks of 1,000.
  - `find(businessId, id)`
  - `paginate(businessId, {page, perPage})`
  - `rows(businessId, id, {status, page, perPage})`
  - `allRows(businessId, id, tx?)`
  - `statusValueCounts(businessId, id, rawColumn)`: one SQL `GROUP BY raw->>$col`.
  - `lockForUpdate(businessId, id, tx): Promise<{status} | null>`
  - `setStatus(id, status, counts?, tx?)`
  - `writeValidation(id, results: {rowNumber, status, normalized, errors, groupKey}[], tx)`: **one** `UPDATE … FROM jsonb_to_recordset($1)` statement.
  - `linkOrders(importId, pairs: {groupKey, orderId}[], tx)`
  - `transaction(fn)`
- `ImportMappingsRepository`:
  - `find(businessId, headersKey)`
  - `save(businessId, headersKey, mapping, tx?)`: upsert.

- [ ] **Step 1: Write failing tests** in `imports.e2e-spec.ts > database`:
  - `refuses an unknown import status`: a raw `UPDATE imports SET status='done'` rejects with a CHECK violation.
  - `refuses an unknown row status`.
  - `keeps one saved mapping per business and header set`: two `save` calls leave one row.
- [ ] **Step 2:** Run `npm test -w @ph/api -- imports`. Expected: FAIL.
- [ ] **Step 3:** Generate the SQL with `prisma migrate diff` (CLAUDE.md "Migrations"), add the CHECKs by hand, then `prisma migrate deploy` on `profithishab` and `profithishab_test`. Write both repositories.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Stop. The user commits.

### Task 3: Pure import rules

**Files:**
- Create: `modules/imports/rules/header-match.ts`, `status-match.ts`, `row-parse.ts`, `orders-group.ts` and a `.spec.ts` beside each.

**Interfaces (Produces):**
- `suggestColumns(headers: string[]): Partial<Record<ImportTarget, string>>`.
  - Matching is case-insensitive and trimmed, with internal spaces, `_` and `-` removed.
  - Each header goes to at most one target. The first match in synonym-list order wins.
  - `HEADER_SYNONYMS: Record<ImportTarget, string[]>`, starting with:
    - phone: `phone, mobile, contact, number, phone number, ফোন, মোবাইল, নম্বর`
    - product: `product, item, product name, পণ্য, প্রোডাক্ট`
    - quantity: `qty, quantity, pcs, পরিমাণ`
    - sellingPrice: `price, unit price, selling price, rate, দাম, মূল্য`
    - customerName: `name, customer, customer name, নাম`
    - address: `address, ঠিকানা`
    - orderDate: `date, order date, তারিখ`
    - externalRef: `order id, order no, invoice, অর্ডার`
    - sku: `sku, code`
    - productCost: `cost, buying price, purchase price, ক্রয়মূল্য`
    - discount: `discount, ছাড়`
    - deliveryCharge: `delivery charge, delivery, shipping`
    - courier: `courier, কুরিয়ার`
    - courierCost: `courier cost, courier charge`
    - paymentMethod: `payment, payment method`
    - status: `status, অবস্থা`
- `suggestStatus(value: string): OrderStatus | null`.
  - `delivered`, `paid`, `complete`, `ডেলিভারড` → `delivered`.
  - `return`, `returned`, `rto`, `ফেরত` → `returned`.
  - `cancel*` → `cancelled`.
  - `shipped`, `in transit` → `shipped`.
  - `confirmed` → `confirmed`.
  - `pending`, `new` → `new`.
  - Anything else → null.
- `parseAmount(cell: string): number | null` (poisha).
- `parseQuantity(cell: string): number | null`.
- `parseImportDate(cell: string): string | null` (`YYYY-MM-DD`). Excel serial `n` → 1899-12-30 + n days. Day-first for slashes and dashes.
- `parseRow(raw: Record<string,string>, mapping: ImportMapping, ctx: { today: string; couriers: Map<string,string> }): ParsedRow`.
  - `ParsedRow = { ok: true; value: NormalizedRow; warnings: string[] } | { ok: false; reasons: ImportRowReason[] }`.
  - `NormalizedRow = { phone, customerName, address, orderDate, externalRef, sku, productName, quantity, unitPrice, unitCost: number|null, discount, deliveryCharge, courierId: string|null, courierCost: number|null, paymentMethod, status }`.
  - An unknown courier name is null. An unknown payment method is `other`.
- `dedupeHash(row: NormalizedRow): string`: sha256 of `phone|orderDate|lower(trim(sku||productName))|quantity|unitPrice`.
- `groupOrders(rows: {rowNumber, value}[]): { groups: ImportOrderGroup[]; conflicts: number[] }`.
  - Rows group by `externalRef`. Without one, each row is its own group with key `row:<n>`.
  - Inside a group, `phone`, `orderDate` and `status` must match, or every row of the group goes to `conflicts`.
  - Order-level fields (`discount`, `deliveryCharge`, `courierCost`) come from the group's first row.
  - `ImportOrderGroup = { key, rowNumbers, phone, customerName, address, orderDate, externalRef, status, paymentMethod, courierId, discount, deliveryCharge, courierCost, items: {sku, productName, quantity, unitPrice, unitCost}[] }`.
  - A discount above the subtotal is clamped down to the subtotal (FR-ORD-05), with warning `discount_clamped`.

- [ ] **Step 1: Write failing tests.** Cover at least these:
  - `suggestColumns(['Mobile','Item','Qty','Rate'])` → `{ phone:'Mobile', product:'Item', quantity:'Qty', sellingPrice:'Rate' }`.
  - `suggestColumns(['ফোন','পণ্য','পরিমাণ','দাম'])` maps all four.
  - `suggestColumns(['Courier','Courier Cost'])` → `{ courier:'Courier', courierCost:'Courier Cost' }`. The longer synonym must not be stolen by `courier`, so exact matches beat contains-matches.
  - `suggestStatus('RTO')` → `'returned'`; `suggestStatus('Paid')` → `'delivered'`; `suggestStatus('ডেলিভারড')` → `'delivered'`; `suggestStatus('hold')` → `null`.
  - `parseAmount('৳ 1,250')` → `125000`; `'1250 Tk'` → `125000`; `'১২৫০'` → `125000`; `'1250.5'` → `125050`; `'-5'` → `null`; `'abc'` → `null`.
  - `parseQuantity('2')` → `2`; `'0'` → `null`; `'1.5'` → `null`.
  - `parseImportDate('03/04/2026')` → `'2026-04-03'`; `'03-04-2026'` → `'2026-04-03'`; `'2026-04-03'` → same; `'46115'` → `'2026-04-03'`; `'31/02/2026'` → `null`.
  - `parseRow` with phone `'1712345678'` → `value.phone === '01712345678'` (Review Focus 1).
  - `parseRow` with no date column → `value.orderDate === ctx.today`, `warnings` contains `'date_missing'`.
  - `parseRow` with phone `'123'`, empty product and qty `0` → `reasons` equal `['phone_invalid','product_missing','quantity_invalid']`.
  - `groupOrders`: two rows with `externalRef 'A1'` and the same phone give one group with 2 items. Two rows `'A2'` with different phones give `conflicts === [rowA, rowB]` (Review Focus 2).
  - `dedupeHash` is equal for `'Saree'` and `' saree '`.
- [ ] **Step 2:** Run `npm test -w @ph/api -- rules`. Expected: FAIL.
- [ ] **Step 3:** Implement the rules. They are pure functions with no Nest or Prisma imports; time comes in through `ctx.today`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Stop. The user commits.

### Task 4: Reading spreadsheets

**Files:**
- Modify: `apps/api/package.json`. Add `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"`.
- Create: `modules/imports/spreadsheet.ts`, `modules/imports/template.ts`
- Test: `modules/imports/spreadsheet.spec.ts`

**Interfaces (Produces):**
- `readSpreadsheet(buffer: Buffer, fileName: string): { headers: string[]; rows: { rowNumber: number; raw: Record<string,string> }[] }`.
  - Throws `ImportError.unsupportedFile()`, `ImportError.tooManyRows(5000)` or `ImportError.noHeader()`.
  - The kind comes from magic bytes, not the extension:
    - `PK\x03\x04` is xlsx.
    - `D0 CF 11 E0` is xls.
    - Otherwise CSV, if there is no NUL byte in the first 8 KB.
  - Read with `XLSX.read(buf, { type: 'buffer', cellDates: false, raw: false })`. Use the first sheet and `sheet_to_json(ws, { header: 1, defval: '', raw: false })`.
  - The header is the first row with **2 or more** non-empty cells. If no row has 2, use the first non-empty row. Title rows like `My Shop` above the header are common. Empty header cells become `Column <n>`; duplicate headers get ` (2)`.
  - Data rows that are completely empty are skipped. `rowNumber` is the 1-based spreadsheet row.
  - Excel date cells come back as their serial number string. Set `dateNF` so they do not format; `parseImportDate` handles serials.
- `buildTemplate(): Buffer`: an xlsx with the headers `Order ID, Order date, Customer name, Phone, Address, Product, SKU, Quantity, Selling price, Product cost, Discount, Delivery charge, Courier, Courier cost, Payment method, Status` and two example rows.
- `ImportError` in `imports.errors.ts`. Each named constructor returns `{ code, status }`:
  - `unsupportedFile` (415 `import_file_unsupported`)
  - `fileTooLarge` (413 `import_file_too_large`)
  - `tooManyRows` (422 `import_too_many_rows`)
  - `noHeader` (422 `import_no_header`)
  - `notFound` (404)
  - `notReady` (409 `import_not_ready`)
  - `cannotUndo` (409 `import_cannot_undo`)

- [ ] **Step 1: Write failing tests.** Build the inputs in the test with `XLSX.utils.aoa_to_sheet` and `XLSX.write`:
  - `reads the first sheet of an xlsx`.
  - `reads a CSV with a UTF-8 BOM and Bangla headers`.
  - `uses the first non-empty row as the header and skips blank rows` (Review Focus 5): rows `['My Shop'], [], ['Phone','Product'], ['01712345678','Saree'], [], ['01812345678','Panjabi']` give headers `['Phone','Product']` and rows numbered 4 and 6. The one-cell title row is skipped because the header needs 2 or more non-empty cells.
  - `rejects a PNG renamed to .xlsx with import_file_unsupported`.
  - `rejects 5,001 data rows with import_too_many_rows`.
  - `buildTemplate() round-trips through readSpreadsheet with 16 headers`.
- [ ] **Step 2:** Run `npm i -w @ph/api` then `npm test -w @ph/api -- spreadsheet`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS. Also run `npm audit --omit=dev`; expect no new advisory from `xlsx`.
- [ ] **Step 5:** Stop. The user commits.

### Task 5: Upload, history and mapping endpoints

**Files:**
- Create: `imports.module.ts`, `imports.controller.ts`, `imports.service.ts`, `imports.presenter.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/imports.e2e-spec.ts`

**Routes** (SRS §8.2; all under the global `AuthGuard`):
- `POST /imports`: multipart field `file`, `FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } })`.
  - Multer's `LIMIT_FILE_SIZE` maps to `ImportError.fileTooLarge()` in the exception filter.
  - Creates the import with `status='uploaded'`.
  - If a saved mapping exists for the `headersKey`, the import gets it straight away and becomes `mapped`.
  - Returns 201 `ImportDto`.
- `GET /imports`: paginated `ImportListItemDto[]`. `canUndo` = `status === 'imported'`.
- `GET /imports/template.xlsx`: declared **before** `:id`. Sends `buildTemplate()` with content-disposition `attachment; filename="profithishab-orders-template.xlsx"`.
- `GET /imports/:id`: `ImportDto`.
  - `suggestedColumns` come from `suggestColumns(headers)`.
  - `statusValues` come from `statusValueCounts` on the mapped (or suggested) status column, each with `suggestStatus`.
- `PUT /imports/:id/mapping`: `importMappingSchema`. Allowed in `uploaded | mapped | validated`, otherwise `notReady`.
  - Saves the mapping on the import and in `import_mappings`.
  - Status becomes `mapped`; any earlier validation is cleared.

**Interfaces (Produces):**
- `ImportsService.upload(auth, file: { buffer: Buffer; originalname: string }): Promise<ImportDto>`
- `ImportsService.show(businessId, id): Promise<ImportDto>`
- `ImportsService.saveMapping(businessId, id, input: ImportMapping): Promise<ImportDto>`

- [ ] **Step 1: Write failing e2e tests** (`describe('upload and mapping')`). Build files in the test with `XLSX`:
  - `401 without a session`.
  - `uploads an xlsx and suggests columns`: 201, `status 'uploaded'`, `suggestedColumns.phone === 'Mobile'`, `sampleRows.length === 5`. Payload keys must not include `rows` or `raw` of every row.
  - `413 for a 6 MB file`.
  - `415 for a text file with NUL bytes named orders.csv`.
  - `another business gets 404 for GET /imports/:id and PUT mapping`.
  - `422 when the mapping misses quantity`.
  - `reuses the saved mapping when the same headers are uploaded again`: the second upload comes back `status 'mapped'` with an equal `mapping` (FR-IMP-03).
  - `lists status values with counts and suggestions`: `[{value:'Delivered',count:3,suggested:'delivered'},{value:'RTO',count:1,suggested:'returned'}]`.
  - `402 after the trial ends`.
  - `GET /imports/template.xlsx returns an xlsx attachment`.
  - Add `import_mappings`, `imports` and `import_rows` to the cross-tenant test in `app.e2e-spec.ts`.
- [ ] **Step 2:** Run `npm test -w @ph/api -- imports`. Expected: FAIL.
- [ ] **Step 3:** Implement. The controller stays thin; it calls one service method per route.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Stop. The user commits.

### Task 6: Validate, preview and rejected rows

**Files:**
- Create: `apps/api/src/common/csv.ts`
- Modify: `imports.service.ts`, `imports.controller.ts`
- Test: `apps/api/src/common/csv.spec.ts`, `imports.e2e-spec.ts`

**Interfaces (Produces):**
- `toCsv(header: string[], rows: string[][]): string`. Starts with `﻿`, uses CRLF, and quotes cells containing `"`, `,`, CR or LF.
- `ImportsService.validate(auth, id): Promise<ImportDto>`. Allowed from `mapped | validated`, otherwise `notReady`. Steps:
  1. Read all rows and the couriers of the business. Courier names are matched case-insensitively to ids. **This task** adds `BusinessService.couriersByName(businessId): Promise<Map<string,string>>` (lowercased name → id) and `OrdersService.existingImportKeys` (step 3); Task 7 reuses both.
  2. Run `parseRow` on each row, then `groupOrders` on the parsed rows.
  3. Duplicates: one query for `externalRef IN (…)` and one for `dedupeHash IN (…)` against `orders` of this business, through `OrdersService.existingImportKeys(businessId, refs, hashes): Promise<{ refs: Set<string>; hashes: Set<string> }>`. A hash already seen earlier in the file is `duplicate_in_file`.
  4. A group is valid only if all of its rows are valid. A duplicate `externalRef` marks the whole group `duplicate` with `duplicate_ref`.
  5. Call `writeValidation` (one statement), and set the counts and status `validated`. `counts.orders` = the number of valid groups.
- `GET /imports/:id/rows?status=`: paginated `ImportRowDto[]`.
- `GET /imports/:id/rejected.csv`: the original headers plus `Row`, `Status` and `Reason` columns. It holds duplicate and invalid rows only and goes through `toCsv`. Reasons are joined by `; ` with English labels from `IMPORT_ROW_REASON_LABELS` (add it to shared).

- [ ] **Step 1: Write failing tests:**
  - `csv.spec.ts`: `toCsv(['a'],[['x,"y"']])` → `'﻿a\r\n"x,""y"""\r\n'`; Bangla text survives as-is.
  - e2e `counts 237 rows as 225 valid, 8 duplicate, 4 invalid`.
    - This uses the fixture from `test/fixtures/make-sample-orders.ts` (create it in this step): `makeSampleOrders(): Buffer`, a deterministic xlsx of 237 rows.
    - The fixture builds 225 valid rows, each a single-item order, so 225 valid rows give 225 orders, matching SRS 11.1 word for word.
    - It adds 8 duplicates: 5 repeat earlier rows without an order ID (`duplicate_in_file`) and 3 repeat an order ID that a pre-imported order already uses (`duplicate_ref`). The test first creates those 3 orders through a small first import, which the fixture builder exports as `makeSeedOrders(): Buffer`.
    - Last, 4 invalid rows: bad phone, missing product, qty 0, date `31/02/2026`.
    - The valid rows add up to sales of ৳5,20,000, product cost of ৳3,00,000 and courier cost of ৳35,000. Phase 2 needs these figures.
    - Expected: `counts` equal `{ total: 237, valid: 225, duplicate: 8, invalid: 4, orders: 225 }`.
  - e2e `GET rows?status=invalid shows each reason`.
  - e2e `rejected.csv starts with a BOM and has 12 data rows`.
  - e2e `re-validating after a mapping change gives fresh counts` (repeat-safety).
  - e2e `groups two rows with the same order ID into one order with two items` (FR-IMP-07). Use a separate 3-row file: `counts.valid === 3`, `counts.orders === 2`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Stop. The user commits.

### Task 7: Commit

**Files:**
- Modify:
  - `business/business.service.ts` and `.repository.ts`
  - `customers/customers.service.ts` and `.repository.ts`
  - `products/products.service.ts` and `.repository.ts`
  - `orders/orders.service.ts` and `.repository.ts`
  - each of those modules' `*.module.ts` `exports` (already exporting the service)
  - `imports.service.ts`, `imports.controller.ts`
  - CLAUDE.md "Current public surfaces"
- Test: `imports.e2e-spec.ts`

**Interfaces (Produces, cross-module, all take `db: Tx`):**
- `BusinessService.reserveOrderNos(businessId, count: number, db): Promise<number>`: the first number of a block of `count`, in one `UPDATE … RETURNING`.
- `BusinessService.couriersByName(businessId): Promise<Map<string,string>>`
- `BusinessService.orderDefaults(...)` (exists): used for default `courierCost`/`packagingCost` when a group has none (FR-BIZ-03).
- `CustomersService.findOrCreateManyForImport(businessId, people: {phone, name, address}[], importId, db): Promise<{ ids: Map<string,string>; created: number }>`: one `SELECT … WHERE phone = ANY($1)`, then one `createMany` for the rest, then a re-select.
- `ProductsService.resolveForImport(businessId, refs: {sku: string|null; name: string; unitPrice: number; unitCost: number|null}[], importId, db): Promise<{ products: Map<string, {id, name, sku, costOn: (date: string) => number}>; created: number }>`.
  - The key is `lower(trim(sku || name))`; SKU first, then name (FR-IMP-08).
  - New products get the next SKUs (`PRD-xxxx`), one `createMany`, and one `product_prices` row each, effective from the earliest order date that uses them.
  - The cost is `unitCost ?? 0`.
- `OrdersService.existingImportKeys(...)` (Task 6).
- `OrdersService.insertImported(businessId, orders: ImportedOrder[], importId, createdById, db): Promise<Map<string,string>>` (groupKey → orderId).
  - `createMany` for orders, items and status history.
  - Each line's `unitCost` = the row cost, else the product's cost on the order date. Totals come from `orderTotals()` in shared. `productCost` is the cache.
  - Does **not** move stock.
- `ImportsService.commit(auth, id): Promise<ImportCommitResultDto>`, in one `repo.transaction`:
  1. `lockForUpdate`. Status must be `validated`, else `notReady` (Review Focus 3).
  2. Rebuild the groups from the rows marked valid.
  3. Customers, then products, then `reserveOrderNos`, then `insertImported`.
  4. `linkOrders`, then `setStatus('imported', { importedRows })`.
  5. After the transaction: `search.index(newProductIds)`, through `ProductsService` (CLAUDE.md "Search").
  - `from`/`to` = the min/max order date, for the dashboard link.

- [ ] **Step 1: Write failing e2e tests** (`describe('commit')`):
  - `imports 225 orders from the fixture`:
    - `orders.count({ where: { importId } }) === 225` and `source === 'import'`.
    - Product stock is unchanged.
    - A `delivered` order has `deliveredAt` set.
    - The response `from`/`to` match the fixture's min and max dates.
  - `re-uploading the same file reports every row as duplicate` (SRS 11.1 item 3).
  - `a second commit gets 409 import_not_ready and the order count stays 225` (Review Focus 3).
  - `rolls back everything when inserting orders fails`: spy `OrdersService.insertImported` to reject. No customers or products with this `importId` remain, and the import stays `validated` and can be committed again.
  - `creates unmatched products with cost 0 and counts them in missingCostProducts`.
  - `reuses an existing customer by phone and an existing product by SKU`.
  - `imports 5,000 rows from validate through commit in under 20 s`: a generated file with a timer assertion. Mark it with `jest.setTimeout(60_000)`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement the cross-module methods first, then `commit`.
- [ ] **Step 4:** Run `npm test`. Expected: PASS, including every existing order and product test.
- [ ] **Step 5:** Stop. The user commits.

### Task 8: Undo

**Files:**
- Modify: `orders`, `customers` and `products` services and repositories, plus `imports.service.ts` and `imports.controller.ts`
- Test: `imports.e2e-spec.ts`

**Interfaces (Produces):**
- `OrdersService.deleteImported(businessId, importId, db): Promise<number>`: one `DELETE FROM orders WHERE businessId=$1 AND importId=$2`. Items and history cascade; check the FKs and add `ON DELETE CASCADE` in the Task 2 migration if missing.
- `CustomersService.deleteUnusedFromImport(businessId, importId, db): Promise<number>`: deletes customers with `importId` and `NOT EXISTS` orders.
- `ProductsService.deleteUnusedFromImport(businessId, importId, db): Promise<number>`: same rule against `order_items`. Price rows cascade. Then remove the products from search after the commit.
- `ImportsService.undo(auth, id): Promise<ImportUndoResultDto>`: lock the import; status must be `imported`, else `cannotUndo`. Delete orders, then customers, then products; set status `undone`. One transaction.
- Route: `POST /imports/:id/undo` (200).

- [ ] **Step 1: Write failing e2e tests:**
  - `undo removes exactly the imported orders` (SRS 11.1 item 4): a manual order made before the import survives.
  - `keeps a product the import created once a manual order uses it`.
  - `keeps a customer the import created once a manual order uses them`.
  - `a second undo is 409 import_cannot_undo`.
  - `another business gets 404`.
  - `rollback`: when the customer delete fails, the orders are still there.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Stop. The user commits.

### Task 9: Web import screens

**Files:**
- Create: the `apps/web/app/(app)/imports/**` files listed in File structure.
- Modify:
  - `apps/web/lib/client-api.ts`: add `upload<T>(path: string, file: File): Promise<ApiResult<T>>`. Sends `FormData` with no `content-type`, but keeps the CSRF header. Also give `api()` an optional `timeoutMs` (default stays 20 s); upload, validate and commit pass `60_000`, because a 5,000-row import can take close to 20 s.
  - `components/AppShell.tsx`: add "Import" (`FileUp` icon) to the main group after Expenses.
  - `middleware.ts`: add `/imports` to `APP_PREFIXES`.
  - The dashboard `Onboarding` "Import your orders" link → `/imports/new`.

**Behaviour:**
- `/imports`: server page with the history table (from `md`) and cards below. "Undo" opens an `AlertDialog`: "Delete the {n} orders from this import? Customers and products it created are removed if nothing else uses them." Then `refreshData(router)`.
- `/imports/new`:
  - File input that accepts `.xlsx,.xls,.csv`, with a client-side 5 MB check.
  - "Download template" link to `/api/imports/template.xlsx`.
  - On success, `navigateFresh(router, '/imports/<id>')`.
- `/imports/[id]`: the server page fetches `ImportDto`; `ImportWizard` picks the step from `status`:
  - `uploaded | mapped` → **MappingStep**:
    - One `SelectField` per target, prefilled from `mapping ?? suggestedColumns`, with options = headers + "Not in my file".
    - Required ones are marked.
    - A table of the 5 sample rows.
    - Save calls `PUT mapping`.
  - Mapped and a status column is chosen → **StatusStep**: one `SelectField` per distinct value, prefilled from `suggested`, with its row count. Continue calls `PUT mapping` (with statuses), then `POST validate`.
  - `validated` → **PreviewStep**:
    - The text `237 rows detected: 225 valid, 8 duplicate, 4 invalid`.
    - Tabs for Valid / Duplicate / Invalid using `GET rows?status=`, with reasons.
    - "Download rejected rows".
    - "Back to mapping".
    - The primary button `Import {counts.orders} Orders`, disabled while pending, so a double click cannot send twice.
  - `imported` → **ResultStep**:
    - `{ordersCreated} orders imported`.
    - "See profit for {from} – {to}" → `/dashboard?from=&to=`.
    - If `missingCostProducts > 0`: "{n} products have no cost. Your profit is shown higher than it really is." with a link to `/products/missing-cost` (FR-IMP-11).
  - `undone` → a notice with a link back to `/imports`.
- Check that the Next `/api` rewrite forwards a 5 MB multipart body. If it is cut off, set `experimental.proxyClientMaxBodySize: '6mb'` in `next.config.mjs`.

- [ ] **Step 1: Write failing Vitest tests** in `ImportWizard.test.tsx`, mocking `@/lib/client-api`:
  - `prefills the mapping from suggestions and refuses Continue until quantity is chosen`.
  - `shows "Import 225 Orders" and sends one commit on a double click`.
  - `shows the missing-cost prompt after import when products lack cost`.
  - `undo asks for confirmation before calling the API` (on `ImportHistory`).
- [ ] **Step 2:** Run `npm test -w @ph/web`. Expected: FAIL.
- [ ] **Step 3:** Implement with `components/ui/*` only, with no native `<select>`. Every control is labelled. Phones get stacked cards.
- [ ] **Step 4:** Run `npm run check`. Expected: PASS.
- [ ] **Step 5:** Stop. The user commits.

### Task 10: End-to-end path and docs

**Files:**
- Create: `apps/web/e2e/import.spec.ts`
- Modify: `CLAUDE.md` (an "Import" section under API rules, plus the public surfaces) and `README.md` (the template link)

- [ ] **Step 1: Write the Playwright test** `register → import sample file → see profit` (SRS 10 Testing), desktop and phone:
  1. Register a fresh seller and go to `/imports/new`.
  2. Upload `makeSampleOrders()`, written to a temp file in `beforeAll`.
  3. Accept the suggested mapping and continue through statuses.
  4. Expect the text `225 valid` and click `Import 225 Orders`.
  5. Expect the result, click "See profit", and expect the dashboard Sales to show `৳5,20,000`.
  6. On phone width, check the import pages have 0 px horizontal overflow.
- [ ] **Step 2:** Run against production builds (API `node dist/main.js`, web `next build && next start -p 3100`): `E2E_BASE_URL=http://localhost:3100 npx playwright test import`. Expected: PASS.
- [ ] **Step 3:** Update CLAUDE.md:
  - The import rules: limits, batch-only, no stock movement, undo scope.
  - The new public surfaces: `BusinessService.reserveOrderNos / couriersByName`, `CustomersService.findOrCreateManyForImport / deleteUnusedFromImport`, `ProductsService.resolveForImport / deleteUnusedFromImport`, `OrdersService.existingImportKeys / insertImported / deleteImported`.
- [ ] **Step 4:** Run `npm run check` and `npm run test:e2e`. Expected: all PASS.
- [ ] **Step 5:** Stop. The user commits. Tick SRS 11.1 items 2–4 in the roadmap.
