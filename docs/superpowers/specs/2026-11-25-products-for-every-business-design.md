# Products for every kind of business — design

**Status:** approved by the owner on 2026-11-26. Stages 1 and 2 built (2026-11-26); Stage 3 not started.
**Date:** 2026-11-25

## 1. Why

After launch, a seller of any kind (clothing, cosmetics, grocery, electronics, medical, or anything
else) must be able to add their products, sell them, keep stock right and see true profit, without us
changing the app for them. The owner should never have to ask "will ProfitHishab work for this
business?".

## 2. Goals, non-goals, anti-goals

**Goals**
- One product format that fits every business type, with the extras each type needs.
- Variants (size, colour, shade, storage, pack size…) with their own SKU, price, cost and stock.
- Selling by weight or volume (1.5 kg, 250 g, 2 litres) as well as by piece.
- Expiry and batch tracking for medicine, food and cosmetics.
- Serial / IMEI and warranty for electronics.
- Saved option lists ("Size: S, M, L, XL") that can be set up once in Settings, or typed while
  adding a product.
- Profit stays correct per variant, per batch and per serial, and past orders never change.

**Non-goals (not in this work)**
- A public online shop, Facebook catalogue sync or barcode label printing.
- Purchase orders, suppliers and payables (stock arrives through a simple "Receive stock" form).
- Prescription records, DGDA reporting or other medical compliance.

**Anti-goals (would be a failure even if it works)**
- A simple seller with one plain product being forced through variant screens. The default form must
  stay as short as today.
- A separate app or separate code path per business type. Every type uses the same product, the same
  order and the same profit code; types only change defaults and which optional sections show.
- Old orders, old profit or old imports changing after this ships.

## 3. Approaches considered

| | Approach | Trade-off | Verdict |
|---|---|---|---|
| **A** | **One product with variants, a unit, free attributes, and optional tracking (batch/expiry, serial)**. Every product has at least one variant; a plain product has one hidden variant. Business type only presets defaults. | One model for all; well proven (Shopify, Daraz seller centre, most POS systems work this way). Needs a careful migration of existing products and order lines. | **Recommended** |
| B | A separate product form and table per business type (clothing table, medicine table…) | Easy to start; every new kind of business needs new code, reports and import rules. A shop selling clothes *and* cosmetics breaks it. | Rejected: fails the "never worry" goal |
| C | Keep today's product and add only free-text attributes | Cheapest; cannot keep stock per size or colour, cannot sell by kg, cannot track expiry. | Rejected: does not cover clothing, grocery or medical |

## 4. The product format (approach A)

```
Product  ── the thing the seller talks about ("Cotton Kurti", "Napa 500mg", "Miniket Rice")
 │  name, category, brand (optional), description (optional)
 │  unit: piece | kg | gram | litre | ml | metre | pack | box | strip | dozen | pair | set
 │  attributes: free "label: value" pairs  (Material: Cotton · Generic: Paracetamol · Warranty: 12 months)
 │  options: up to 3, e.g. Size [S, M, L, XL] and Colour [Red, Blue]
 │  tracking: [ ] expiry & batch     [ ] serial / IMEI     warranty: 0–60 months
 │
 └── Variant  ── what is actually sold and counted (one per option combination; one hidden variant
      │          for a product with no options)
      │  option values (Size M, Colour Red) · SKU · barcode (optional)
      │  selling price · cost · stock · active
      │  price history (as today, but per variant)
      │
      ├── Batch   (only when "expiry & batch" is on)  batch no · expiry date · quantity · cost
      └── Serial  (only when "serial / IMEI" is on)  serial or IMEI · in stock | sold | returned
```

- **Every order line points at a variant**, not a product. A plain product's single variant is never
  shown, so a plain seller sees exactly today's form.
- **Quantity becomes a decimal number** (up to 3 decimals). Units by weight, volume or length (kg,
  gram, litre, ml, metre) allow decimals; piece-like units (piece, pack, box, strip, dozen, pair,
  set) stay whole numbers.
- **Price and cost are per one unit** (৳ per kg, ৳ per piece). Line total = quantity × unit price.
- **Business type only sets defaults** when a product is created (see section 6). Every field is
  available to every business under "More options", so a grocery that also sells phones works.

## 5. Screens, one example per business type

The mock-ups below show the layout of the product form; colours and spacing follow the existing app.

### 5.1 Clothing — "Cotton Kurti" in 4 sizes × 2 colours

```
┌─ New product ──────────────────────────────────────────────────────────────┐
│ Name          [ Cotton Kurti                  ]   Category [ Kurti      ▾] │
│ Sold by       [ Piece ▾ ]                                                  │
│                                                                            │
│ Options                                     [ + Add option ] [ Use saved ▾]│
│   Size     [S] [M] [L] [XL] [+]                                            │
│   Colour   [Red] [Blue] [+]                                                │
│                                                                            │
│ Variants (8)          Set all:  price [1250]  cost [700]   [ Apply ]       │
│ ┌──────────────┬────────────┬─────────┬────────┬───────┬────────┐          │
│ │ Variant      │ SKU        │ Price ৳ │ Cost ৳ │ Stock │ Active │          │
│ ├──────────────┼────────────┼─────────┼────────┼───────┼────────┤          │
│ │ S / Red      │ KUR-S-RED  │ 1250    │ 700    │ 10    │  ☑     │          │
│ │ M / Red      │ KUR-M-RED  │ 1250    │ 700    │ 14    │  ☑     │          │
│ │ L / Red      │ KUR-L-RED  │ 1250    │ 700    │ 8     │  ☑     │          │
│ │ XL / Red     │ KUR-XL-RED │ 1350    │ 760    │ 4     │  ☑     │          │
│ │ S / Blue … (4 more rows)                                         │          │
│ └──────────────┴────────────┴─────────┴────────┴───────┴────────┘          │
│ ▸ More options (brand, attributes, expiry, serial, warranty)               │
│                                                         [ Save product ]   │
└────────────────────────────────────────────────────────────────────────────┘
```

- SKUs are suggested from the name and options (`KUR-M-RED`) and can be edited.
- "Use saved ▾" fills Size/Colour from Settings → Product options (section 7).
- XL costs more, so it gets its own price and cost; profit per variant stays exact.

**Proof it works — selling 2 × M/Red and 1 × XL/Red in one order**

| Line | Qty | Unit price | Line total | Unit cost | Product cost |
|---|---|---|---|---|---|
| Cotton Kurti — M / Red | 2 | ৳1,250 | ৳2,500 | ৳700 | ৳1,400 |
| Cotton Kurti — XL / Red | 1 | ৳1,350 | ৳1,350 | ৳760 | ৳760 |
| **Order** | | | **৳3,850** | | **৳2,160** |

Stock after the order: M/Red 14 → 12, XL/Red 4 → 3. Gross profit ৳1,690. The product-profit report
shows "Cotton Kurti" ৳1,690 with a breakdown per variant.

### 5.2 Cosmetics — "Matte Lipstick" in shades, with expiry

```
┌─ New product ──────────────────────────────────────────────────────────────┐
│ Name   [ Matte Lipstick ]   Brand [ Maybelline ]   Sold by [ Piece ▾ ]     │
│ Options   Shade  [Ruby 01] [Nude 05] [Coral 12] [+]                        │
│ Variants (3)   SKU · Price ৳ 650 · Cost ৳ 380 · Stock                      │
│ Tracking  ☑ Expiry & batch                                                 │
│   Opening stock for "Ruby 01":  batch [ RB2405 ]  expiry [ 2027-03 ]  qty [ 20 ] │
└────────────────────────────────────────────────────────────────────────────┘
```

Works exactly like clothing for variants, and like medicine (5.4) for expiry.

### 5.3 Grocery — "Miniket Rice" sold by kg, and "Soybean Oil" in two pack sizes

```
┌─ New product ──────────────────────────────────────────────────────────────┐
│ Name  [ Miniket Rice ]   Sold by [ kg ▾ ]   Price ৳ [ 78 ] per kg          │
│                                              Cost  ৳ [ 66 ] per kg          │
│ Stock  [ 250 ] kg                                                          │
└────────────────────────────────────────────────────────────────────────────┘
┌─ New product ──────────────────────────────────────────────────────────────┐
│ Name  [ Soybean Oil ]   Sold by [ Bottle ▾ ]                               │
│ Options  Pack size [1 litre] [5 litre]                                     │
│ Variants   1 litre  ৳ 190 / cost 172 / stock 40                            │
│            5 litre  ৳ 920 / cost 845 / stock 12                            │
│ Tracking  ☑ Expiry & batch                                                 │
└────────────────────────────────────────────────────────────────────────────┘
```

**Proof — an order for 2.5 kg rice and one 5-litre oil**

| Line | Qty | Unit price | Line total | Product cost |
|---|---|---|---|---|
| Miniket Rice (kg) | 2.5 | ৳78 | ৳195 | 2.5 × ৳66 = ৳165 |
| Soybean Oil — 5 litre | 1 | ৳920 | ৳920 | ৳845 |
| **Order** | | | **৳1,115** | **৳1,010** |

Rice stock 250 → 247.5 kg. Money stays whole poisha: 2.5 × 7,800 = 19,500 poisha (rounded to the
nearest poisha when a quantity has 3 decimals).

### 5.4 Medical — "Napa 500mg" by strip, with batches and expiry

```
┌─ New product ──────────────────────────────────────────────────────────────┐
│ Name  [ Napa 500mg ]   Brand [ Beximco ]   Sold by [ Strip ▾ ]             │
│ Attributes   Generic [ Paracetamol ]   Strength [ 500 mg ]   Form [ Tablet ]│
│ Price ৳ [ 12 ] per strip   Cost ৳ [ 9.50 ]                                 │
│ Tracking  ☑ Expiry & batch   (on by default for Medical)                   │
└────────────────────────────────────────────────────────────────────────────┘

┌─ Receive stock — Napa 500mg ───────────────────────────────────────────────┐
│ Batch no [ NP2611 ]  Expiry [ 2027-06-30 ]  Quantity [ 200 ] strips        │
│ Cost per strip ৳ [ 9.50 ]                                   [ Add stock ]   │
└────────────────────────────────────────────────────────────────────────────┘

Product page — Napa 500mg                         Stock 320 strips
┌──────────┬────────────┬──────┬──────────┬──────────────────────┐
│ Batch    │ Expiry     │ Qty  │ Cost ৳   │                      │
├──────────┼────────────┼──────┼──────────┼──────────────────────┤
│ NP2604   │ 2026-12-31 │ 120  │ 9.20     │ ⚠ Expires in 36 days │
│ NP2611   │ 2027-06-30 │ 200  │ 9.50     │                      │
└──────────┴────────────┴──────┴──────────┴──────────────────────┘
```

**Proof — selling 150 strips takes the batch that expires first (FEFO)**

| From batch | Qty | Cost | Line cost |
|---|---|---|---|
| NP2604 (expires 2026-12-31) | 120 | ৳9.20 | ৳1,104 |
| NP2611 (expires 2027-06-30) | 30 | ৳9.50 | ৳285 |
| **Total** | **150** | | **৳1,389** (avg ৳9.26/strip) |

The order line keeps the real cost ৳1,389, so profit uses the cost of the batches actually sold.
Batch NP2604 is now empty; NP2611 has 170 left. An expired batch can't be sold; **Clear stock** on the product list or product
page removes it, and its cost appears as a loss in that month's profit (owner decision 2, section 14).

**Dashboard alert (also for grocery and cosmetics)**

```
⚠ 3 batches expire within 30 days (৳4,860 at cost)   [ See them ]
✕ 1 batch has expired (৳620 at cost)                 [ Clear stock ]
```

### 5.5 Electronics — "Redmi Note 13" by storage, with IMEI and warranty

```
┌─ New product ──────────────────────────────────────────────────────────────┐
│ Name [ Redmi Note 13 ]  Brand [ Xiaomi ]  Sold by [ Piece ▾ ]              │
│ Options  Storage [8/128] [8/256]   Colour [Black] [Blue]                   │
│ Variants (4)  8/128 Black ৳ 24,999 / cost 22,100 …                         │
│ Tracking  ☑ Serial / IMEI   Warranty [ 12 ] months (on by default for Electronics) │
└────────────────────────────────────────────────────────────────────────────┘

┌─ Receive stock — Redmi Note 13 8/128 Black ────────────────────────────────┐
│ IMEIs (one per line or scan)                                               │
│   861234050012341                                                          │
│   861234050012358                                                          │
│   861234050012366                                      3 units [ Add ]     │
└────────────────────────────────────────────────────────────────────────────┘

New order — line "Redmi Note 13 8/128 Black" × 1
   IMEI  [ 861234050012341 ▾ ]   (only in-stock IMEIs are offered)
   Warranty until 2027-11-25 (shown on the order and the invoice)
```

**Proof:** the order line stores the IMEI. Marking the order *Returned* puts that IMEI back in stock;
searching an IMEI finds the order and customer (for warranty claims). Stock = number of IMEIs in
stock, so it can never drift.

### 5.6 A plain product (any business) — unchanged from today

```
┌─ New product ──────────────────────────────────────────────────────────────┐
│ Name [ Gift Box ]  Category [ Other ▾ ]  Price ৳ [ 350 ]  Cost ৳ [ 120 ]   │
│ Stock [ 40 ]                                                               │
│ ▸ More options (unit, variants, brand, attributes, expiry, serial, warranty)│
│                                                         [ Save product ]   │
└────────────────────────────────────────────────────────────────────────────┘
```

One hidden variant is created. The seller never sees the word "variant".

## 6. Defaults per business type

Set when a product is created; the seller can change any of them.

| Business type (from sign-up, editable in Settings) | Default unit | Suggested options | Tracking on by default | Suggested attributes |
|---|---|---|---|---|
| Clothing & fashion | Piece | Size, Colour | — | Material, Fit |
| Cosmetics & beauty | Piece | Shade | Expiry & batch | Skin type, Volume |
| Food & grocery | kg | Pack size | Expiry & batch | Origin |
| Electronics & gadgets | Piece | Storage, Colour | Serial / IMEI, warranty 12 months | Model |
| Medical / pharmacy (new type) | Strip | — | Expiry & batch | Generic name, Strength, Form |
| Home & lifestyle, Other | Piece | — | — | — |

## 7. Saved option lists (Settings → Product options)

```
┌─ Settings ─ Product options ───────────────────────────────────────────────┐
│ Size          S, M, L, XL, XXL                          [ Edit ] [ Delete ]│
│ Shoe size     36, 37, 38, 39, 40, 41, 42                [ Edit ] [ Delete ]│
│ Colour        Red, Blue, Black, White, Green            [ Edit ] [ Delete ]│
│ Storage       8/128, 8/256, 12/256                      [ Edit ] [ Delete ]│
│                                                    [ + New option list ]   │
└────────────────────────────────────────────────────────────────────────────┘
```

Lists start with the presets for the business type. On the product form, "Use saved" copies a list;
typing a new value on the product form does not change the saved list (it can be saved with one
click: "Save Colour list").

## 8. Orders

```
Product  [ kur▾                                    ]
          Cotton Kurti — S / Red      ৳1,250   stock 10
          Cotton Kurti — M / Red      ৳1,250   stock 14
          Cotton Kurti — XL / Red     ৳1,350   stock 4
          Kurti (plain)               ৳900     stock 30
```

- The product picker lists variants as "Product — option values"; a plain product shows its name only.
- Quantity accepts decimals only for weight/volume/length units, and shows the unit ("2.5 kg").
- Expiry products take stock from the earliest batch automatically (no extra clicks); serial products
  ask for the serial(s).
- Stock checks, returns and cancellations work per variant (and per batch or serial).

## 9. Import

New optional columns, matched automatically like today:

| Column in the seller's file | Meaning |
|---|---|
| SKU (variant SKU) | Best match: finds the exact variant |
| Size / Colour / Variant / Option 1–3 | With the product name, finds or creates the variant |
| Unit | kg, piece, litre … (new products only) |
| Batch, Expiry | Recorded on the imported line (imported orders never move stock, as today) |
| Serial / IMEI | Recorded on the imported line |

Example file row → result:

```
Product        Size  Colour  Qty  Selling price
Cotton Kurti   M     Red     2    1250
→ matched to "Cotton Kurti — M / Red" (created if it does not exist, flagged "new" on the preview)
```

Quantities like "2.5" are accepted for decimal units; "2.5" for a piece product is an error on that cell.

## 10. Profit and reports

- Every order line already stores its own unit price and unit cost; nothing about profit maths changes.
- Product profit report: one row per product, expandable into variants.
- New: expiry write-offs count as a loss ("Written-off stock" line in the profit statement).
- New report: stock value and expiring stock (per batch).

## 11. Data changes (for the builder)

| Table | Change |
|---|---|
| `products` | + `unit`, `brand`, `description`, `attributes` (jsonb), `options` (jsonb, ≤3), `tracksBatches`, `tracksSerials`, `warrantyMonths`. Price, cost, stock and SKU move to variants. |
| `product_variants` (new) | `productId`, `businessId`, `optionValues` (jsonb), `sku` (unique per business), `barcode`, `sellingPrice`, `costPrice`, `stock` (numeric 12,3), `status` |
| `product_prices` | keyed by variant |
| `order_items` | + `variantId`, `variantLabel` (snapshot "M / Red"), `quantity` → numeric(12,3), + `batchAllocations` / `serials` |
| `stock_batches` (new) | `variantId`, `batchNo`, `expiresOn`, `quantity`, `unitCost`, `receivedOn` |
| `product_serials` (new) | `variantId`, `serial` (unique per business), `status`, `orderItemId` |
| `option_lists` (new) | per business: name + values |
| `businesses.businessType` | becomes a checked list (adds Medical / pharmacy) |

**Migration of existing data:** every existing product gets one hidden variant carrying its SKU,
prices, price history and stock; every existing order line is linked to that variant. Totals, profit
and imports are identical before and after (checked by a migration test that compares every report
before and after).

## 12. Build in stages

Each stage ships on its own and keeps everything working.

| Stage | Delivers | Business types it completes |
|---|---|---|
| 1 | Product + variants, units with decimal quantity, attributes, brand, saved option lists, business-type defaults, orders and import per variant, migration | Clothing, cosmetics (without expiry), grocery (without expiry), home, other |
| 2 | Batches and expiry: Receive stock, FEFO on sale, expiry alerts, write-off as loss | Medical, grocery, cosmetics |
| 3 | Serial / IMEI and warranty | Electronics |

## 13. Left to the builder

- Exact SKU suggestion format, and the order of columns in the variant table.
- How many decimal places to show for each unit (kg 3, litre 3, metre 2).
- Whether "Receive stock" is a dialog or a page (a dialog fits the current app).

## 14. Owner decisions

1. Add the business type **"Medical / pharmacy"**: yes (approved with the design).
2. Expired stock (decided 2026-11-26): **expired stock can't be sold, and the seller clears it in one click.**
   - **Order search:** a batch past its expiry date can't be picked for an order. A product whose stock has all expired doesn't appear in the order search. A product with some fresh stock appears, and only the fresh quantity can be sold (FEFO uses fresh batches only).
   - **Product list:** an expired product stays visible, marked "Expired" with how much stock and its cost, and a **Clear stock** button.
   - **Clear stock:** confirmed in-page first, then the stock of the expired batches goes to 0. The cost of what was cleared counts as a loss in that month's profit (as in 5.4). A record of what was cleared and when is kept.
3. Stage order 1 → 2 → 3: yes (approved with the design).
