# ProfitHishab — Software Requirements Specification (SRS)

| | |
|---|---|
| Product | ProfitHishab — profit intelligence for Bangladeshi Facebook/F-commerce sellers |
| Tagline | "Sales দেখবেন না — আসল Profit বুঝবেন।" |
| Document version | 1.0 (2026-10-01) |
| Stack | React (Next.js, server-side rendered) + Node.js (NestJS) + PostgreSQL, all TypeScript |
| Scope of this document | V1 in full, build-ready detail. V2–V4 as requirements plus the V1 data-model hooks they need. |

---

## 1. Introduction

### 1.1 Purpose

This document defines what ProfitHishab must do and how it is built, in enough detail to start development without further design work. Every functional requirement has an ID (`FR-…`) so tasks, commits and tests can reference it.

### 1.2 Product vision

Existing tools (Shopra, Hishab, B2Roll, SORS, SeloraX) compete on breadth: orders, inventory, courier, payments, accounting. ProfitHishab does not compete on breadth. It answers one question better than anything else:

> **"এই মাসে আমার আসল profit কত, আর টাকা কোথায় যাচ্ছে?"**

The differentiator is **profit, COD leakage, return loss, ad cost and product-level profitability**. Order, product and customer management exist only because profit must be calculated from real transactions.

### 1.3 Success criteria for V1

1. A new seller goes from sign-up to seeing their real monthly net profit in under 10 minutes, using an Excel import.
2. A returning seller can read this month's net profit within 30 seconds of opening the app.
3. Every number on the dashboard can be traced to the orders and expenses behind it.
4. At least 20 real sellers have loaded real data, and some of them say they would pay.

### 1.4 Explicitly out of scope for V1

POS, full accounting, website builder, warehouse-grade inventory, payroll/HRM, large CRM, Messenger automation, courier API integrations, payment gateways, multi-store, team roles, marketplace, AI chatbot. Several of these arrive in V2–V4 (section 12); none may leak into V1.

### 1.5 Definitions

| Term | Meaning |
|---|---|
| Seller | The business owner using ProfitHishab |
| Business | A seller's shop; the tenant boundary for all data |
| COD | Cash on delivery |
| COGS | Cost of goods sold: quantity × unit cost of items in delivered orders |
| Poisha | 1/100 of a taka; the unit all money is stored in |
| SSR | Server-side rendering: HTML is produced on the server for the first paint |
| Period | A date range in the business's timezone (default: the current calendar month) |

---

## 2. Users and roles

| Role | Version | Description |
|---|---|---|
| Owner | V1 | Registers, owns one business, has full access. The only role in V1. |
| Staff (Order Manager, Support, Accounts, Warehouse) | V4 | Permission-limited members of a business |
| Platform admin | V2 | Internal: view sign-ups and usage, support sellers |

The V1 schema already contains a `business_members` table so that V4 team management needs no data migration; V1 creates exactly one `owner` row per business.

**Typical seller:** runs a Facebook page from Dhaka, 100–1,500 orders a month, tracks orders in Excel or a notebook, ships with Pathao/Steadfast/RedX, mostly COD, uses a phone more than a laptop, and prefers Bangla.

---

## 3. System architecture

### 3.1 Overview

```
Browser (mobile first)
      │  HTTPS
      ▼
┌──────────────────────────────┐
│ apps/web — Next.js (React)   │  SSR + client components
│  • marketing pages (static)  │
│  • app pages (SSR per user)  │
│  • /api/* rewrite → API      │
└──────────────┬───────────────┘
               │ HTTP (private network), cookies forwarded
               ▼
┌──────────────────────────────┐
│ apps/api — NestJS (Node.js)  │  REST /v1, validation, auth, profit engine
└───────┬──────────────┬───────┘
        ▼              ▼
   PostgreSQL     Object storage (S3-compatible: logos, import files)
```

One modular backend, one web app, one database. No microservices.

### 3.2 Technology choices

| Concern | Choice | Reason |
|---|---|---|
| Language | TypeScript everywhere, strict mode | Shared types between web and API |
| Runtime | Node.js, current LTS | |
| Web | Next.js (App Router) + React | SSR out of the box, file routing, static marketing pages |
| API | NestJS | Modules, controllers, services, DI, guards and validation pipes map directly onto the Laravel structure you already know |
| ORM | Prisma | Typed queries, migrations |
| Database | PostgreSQL 16+ | Aggregations, `jsonb`, partial indexes |
| Validation | Zod schemas in a shared package | One schema validates the form in React and the request in Nest |
| UI | Tailwind CSS + shadcn/ui | Fast, accessible, easy to theme |
| Client data | TanStack Query | Caching, optimistic updates for lists and forms |
| Forms | React Hook Form + Zod resolver | |
| Charts | Recharts | Profit trend, breakdown |
| Tables | TanStack Table | Sorting, pagination |
| Import parsing | SheetJS (`xlsx`) for Excel, `papaparse` for CSV, parsed on the server | |
| i18n | `next-intl`, locales `bn` (default) and `en` | |
| Auth | Server sessions in PostgreSQL, opaque token in an httpOnly cookie, Argon2id password hashing | Simple to revoke, safe with SSR |
| Email | Resend (or any SMTP) | Password reset, verification |
| Tests | Vitest (unit), Supertest (API), Playwright (end-to-end) | |
| Monorepo | pnpm workspaces + Turborepo | |
| Deployment | Docker Compose on one VPS behind Caddy (automatic TLS) | Cheap and enough for the first few hundred sellers |

Deferred until needed: Redis and BullMQ (V2, for background imports and scheduled alerts), a mobile app (the V1 web app is responsive and installable as a PWA).

### 3.3 Rendering strategy (SSR)

| Route group | Rendering | Notes |
|---|---|---|
| `/`, `/pricing`, `/features`, `/blog/*` | Static generation, revalidated | SEO matters here; Bangla and English versions; Open Graph tags for Facebook sharing |
| `/login`, `/register`, `/forgot-password` | SSR | Redirect to `/dashboard` on the server when a session already exists |
| `/dashboard`, `/products`, `/orders`, `/customers`, `/expenses`, `/reports/*` | SSR per request, never cached | The server component reads the session cookie, fetches the first page of data from the API, and streams HTML. Client components then take over with TanStack Query, seeded from the server data. |
| `/imports/new` (wizard), order form | Client components inside an SSR shell | Highly interactive |

Rules:

- **Auth and SSR.** The browser only ever talks to the Next.js origin. `next.config` rewrites `/api/*` to the Nest API, so the session cookie is first-party and there is no CORS. Server components call the API over the private network and forward the incoming `Cookie` header.
- **Route protection.** Next.js middleware redirects unauthenticated requests on app routes to `/login?next=…`. The API re-checks on every request; the middleware is a convenience, not the security boundary.
- **Streaming.** Dashboard KPI cards render first; the trend chart and top-products table are wrapped in `<Suspense>` with skeletons so slow aggregates never block first paint.
- **No user data in shared caches.** All authenticated routes send `Cache-Control: private, no-store`.
- **Hydration safety.** Dates and money are formatted with an explicit locale and the business timezone on both server and client, never the machine default.

### 3.4 Repository layout

```
profithishab/
├── apps/
│   ├── web/                     # Next.js
│   │   ├── app/
│   │   │   ├── (marketing)/     # landing, pricing
│   │   │   ├── (auth)/          # login, register, forgot/reset password
│   │   │   └── (app)/           # dashboard, products, orders, customers,
│   │   │                        # expenses, imports, reports, settings
│   │   ├── components/          # ui/ (shadcn), feature components
│   │   ├── lib/                 # api client, formatters, query keys
│   │   └── messages/            # bn.json, en.json
│   └── api/                     # NestJS
│       ├── src/modules/
│       │   ├── auth/  business/  products/  categories/  customers/
│       │   ├── orders/  couriers/  expenses/  imports/
│       │   ├── profit/          # the profit engine (section 6)
│       │   └── reports/
│       ├── src/common/          # guards, tenant context, filters, pipes
│       └── prisma/              # schema.prisma, migrations, seed
├── packages/
│   ├── shared/                  # Zod schemas, enums, money + phone helpers
│   └── config/                  # eslint, tsconfig
├── docker-compose.yml
└── SRS.md
```

Backend layering inside each module: `controller` (HTTP only) → `service` (business logic) → `repository` (all Prisma calls). Controllers never query the database and services never receive the raw request object.

### 3.5 Multi-tenancy

Single database, shared schema. Every business-owned table has a `business_id` column.

- A `TenantGuard` resolves the current business from the session and stores it in a request-scoped context.
- Repositories take `businessId` from that context, never from the request body or URL.
- A Prisma client extension rejects any query on a tenant table that lacks a `business_id` filter, so a forgotten filter fails loudly in development instead of leaking data.
- Every tenant table has an automated test proving that business A cannot read or change business B's rows.

---

## 4. Global rules

| Rule | Specification |
|---|---|
| Money | Stored as integer poisha (`BIGINT`). ৳2,500.00 is stored as `250000`. No floats anywhere in calculations. |
| Money display | `৳` prefix, South Asian grouping (`৳5,20,000`), compact form on cards (`৳5.2L`). Bangla digits when the locale is `bn` and the seller enables it. |
| Currency | BDT only in V1; the `currency` column exists for the future |
| Time | Stored in UTC. Period boundaries are computed in the business timezone, default `Asia/Dhaka`. |
| Phone numbers | Normalised to 11 digits `01XXXXXXXXX`: strip spaces, dashes, `+88`, `88`; convert Bangla digits. Anything else is invalid. |
| IDs | UUID v7 primary keys. Orders also have a human `order_no` per business (`#1042`). |
| Percentages | Calculated from poisha values, rounded to one decimal for display |
| Language | Bangla default, English switchable per user. Seller-entered data is never translated. |
| Deletion | Products are archived, not deleted, once used in an order. Orders are cancelled, not deleted (exception: undoing an import). |

---

## 5. V1 functional requirements

### 5.1 Authentication and account

| ID | Requirement |
|---|---|
| FR-AUTH-01 | Register with: name, business name, email **or** phone (at least one), password, business type, city. Currency is fixed to BDT. Registration creates the user, the business, the owner membership, default expense categories and default couriers in one transaction. |
| FR-AUTH-02 | Password: minimum 8 characters. Stored as an Argon2id hash. |
| FR-AUTH-03 | Email and phone are each unique across users. Errors do not reveal whether an account exists on login or reset. |
| FR-AUTH-04 | Log in with email or phone plus password. On success a session row is created and an opaque token is set in a cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, 30-day sliding expiry. |
| FR-AUTH-05 | Log out revokes the current session. "Log out everywhere" revokes all sessions. |
| FR-AUTH-06 | Forgot password by email: single-use link, valid 60 minutes, token stored hashed. Resetting revokes all sessions. |
| FR-AUTH-07 | Forgot password by phone: 6-digit SMS code, valid 10 minutes, maximum 5 attempts. Sits behind an `SmsProvider` interface; if no gateway is configured at launch, phone-only sign-up is disabled and email is required. |
| FR-AUTH-08 | Rate limits: 5 failed logins per 15 minutes per identifier and per IP; 3 reset requests per hour. |
| FR-AUTH-09 | Change password (requires the current password) and edit name, email, phone from settings. |

### 5.2 Business profile and settings

| ID | Requirement |
|---|---|
| FR-BIZ-01 | Edit: business name, logo (PNG/JPG/WebP up to 2 MB, resized to 256 px), phone, address, city, business type, Facebook page URL. |
| FR-BIZ-02 | Default courier, used to prefill new orders. |
| FR-BIZ-03 | Profit settings: default courier cost per order, default return cost per order, and default packaging cost per order. These prefill new and imported orders that carry no cost of their own. |
| FR-BIZ-04 | Couriers list: seeded with Pathao, Steadfast, RedX, Other. The seller can add, rename and deactivate couriers and set a default cost for each. |
| FR-BIZ-05 | Onboarding checklist on the dashboard until complete: add or import products → import or create orders → add this month's ad spend → see your profit. |

### 5.3 Products

| ID | Requirement |
|---|---|
| FR-PROD-01 | Fields: name (required), SKU (unique per business; auto-generated as `PRD-0001` if blank), category (optional), selling price (required), product cost (required, may be 0), stock (integer, default 0), status (`active`, `archived`). |
| FR-PROD-02 | The form and list show live gross profit (`selling − cost`) and margin (`gross ÷ selling`). Example: ৳2,500 − ৳1,350 = ৳1,150, 46%. |
| FR-PROD-03 | List: search by name or SKU (Typesense: prefix, typo-tolerant on names, any part of a SKU), filter by category and status, sort by name, price, margin, stock; paginated 25 per page. |
| FR-PROD-04 | Categories: simple flat list with create, rename, delete. Deleting a category leaves its products uncategorised. |
| FR-PROD-05 | A product with cost 0 is flagged **"Cost missing"** in the list and counted on the dashboard, because it inflates profit. |
| FR-PROD-06 | Changing a product's cost or price adds a row to its price history, effective from today (business timezone); several changes on one day keep the last. Existing order items keep their snapshot (FR-ORD-03) and are never rewritten. A new order line takes the price and cost in effect on the order's date, so a backdated order uses the price of that day. The edit page shows the history. |
| FR-PROD-07 | Stock: reduced when an order is created, restored when it is cancelled or returned. Stock may go negative, shown with a warning; it never blocks an order. Imported orders do not change stock. This is the full extent of inventory in V1. |
| FR-PROD-08 | Bulk product import from Excel/CSV using the import module (section 5.7) with product columns. |

### 5.4 Orders

| ID | Requirement |
|---|---|
| FR-ORD-01 | Create order with: customer (search by phone; create inline if new), delivery address, one or more items (product, quantity, unit price), discount, delivery charge collected from the customer, payment method, courier, order date (default today), note. |
| FR-ORD-02 | Payment methods: `cod`, `bkash`, `nagad`, `rocket`, `bank`, `cash`, `other`. |
| FR-ORD-03 | Each order item snapshots `product_name`, `sku`, `unit_price` and `unit_cost` at creation. Profit always reads the snapshot, never the live product. |
| FR-ORD-04 | Cost fields per order, prefilled from settings and editable: `courier_cost` (what the seller pays the courier), `packaging_cost`, and `return_cost` (only relevant once returned). |
| FR-ORD-05 | Totals: `subtotal = Σ quantity × unit_price`; `total = subtotal − discount + delivery_charge`. Discount cannot exceed the subtotal. |
| FR-ORD-06 | Statuses: `new`, `confirmed`, `processing`, `shipped`, `delivered`, `cancelled`, `returned`. No others. |
| FR-ORD-07 | Status changes: any forward move is allowed, including skipping steps (a seller may mark a new order delivered). `cancelled` is allowed from any status before `delivered`. `returned` is allowed from `shipped` or `delivered`. A wrong status can be corrected by moving back. Every change writes an `order_status_history` row; `delivered_at` and `returned_at` are set on entering those statuses. |
| FR-ORD-08 | List: filter by status, courier, payment method and date range; search by order number, customer name or phone; paginated; status tabs with counts. |
| FR-ORD-09 | Bulk status update on selected orders (the common case: mark 30 orders delivered after a courier settlement). |
| FR-ORD-10 | Order detail shows the profit breakdown for that single order: sales, product cost, courier, packaging, profit. |
| FR-ORD-11 | Editing items, discount or costs is allowed in any status and recalculates totals. |

### 5.5 Customers

| ID | Requirement |
|---|---|
| FR-CUST-01 | Fields: name, phone (required, unique per business after normalisation), address, city, note. |
| FR-CUST-02 | Customers are created automatically from orders and imports. An existing phone number reuses the customer. |
| FR-CUST-03 | List columns, all computed from orders: total orders, delivered, returned, total spent, last order date. Search by name or phone; sort by any column. |
| FR-CUST-04 | Profile page: the stats above plus profit generated (section 6.4) and the customer's order history. |
| FR-CUST-05 | Stats are calculated by query, not stored. This is the data V2's risk score is built from. |

### 5.6 Expenses

| ID | Requirement |
|---|---|
| FR-EXP-01 | Default categories seeded per business: Facebook Ads, Packaging, Salary, Rent, Courier, Internet, Other. Each has a `kind`: `ads`, `courier`, or `other`. |
| FR-EXP-02 | The seller can add, rename and delete custom categories. System categories cannot be deleted. |
| FR-EXP-03 | Expense fields: category, amount, date, note. A "whole month" shortcut records the expense on the first day of the chosen month. |
| FR-EXP-04 | List with month and category filters, and a total per category for the selected period. |
| FR-EXP-05 | Double-counting guard: adding an expense in a `courier` category, or in Packaging, for a period that already has per-order courier or packaging costs shows a warning explaining that those costs are already counted on orders. The seller can continue. |
| FR-EXP-06 | Quick entry from the dashboard: "Add this month's Facebook ad spend". |

### 5.7 Excel / CSV import (V1 priority)

The import is the onboarding path. It is a four-step wizard.

| ID | Requirement |
|---|---|
| FR-IMP-01 | **Upload.** Accept `.xlsx`, `.xls`, `.csv`, up to 5 MB and 5,000 data rows. The first sheet is used; the first non-empty row is the header. A downloadable sample template is provided. |
| FR-IMP-02 | **Map columns.** The system proposes a mapping by matching headers against a synonym list in English and Bangla (for example `Phone`, `Mobile`, `Contact`, `ফোন`, `মোবাইল`). The seller can correct any mapping. Required targets: phone, product, quantity, selling price. Optional: customer name, address, order date, order ID, SKU, product cost, discount, delivery charge, courier, courier cost, payment method, status. |
| FR-IMP-03 | The mapping is saved per business and reused when the same headers are uploaded again. |
| FR-IMP-04 | **Status mapping.** Distinct values in the status column are listed and mapped to the seven statuses, with auto-suggestions (`Delivered`, `Paid`, `ডেলিভারড` → `delivered`; `Return`, `Returned`, `RTO` → `returned`). No status column means every row is imported as `delivered`. |
| FR-IMP-05 | **Validate.** Each row becomes `valid`, `duplicate` or `invalid` with a reason. Invalid: unparseable phone, missing product, quantity < 1, non-numeric price, unparseable date. Dates accept `DD/MM/YYYY`, `DD-MM-YYYY`, `YYYY-MM-DD` and Excel serial dates. A missing date uses the import date and shows a warning. |
| FR-IMP-06 | **Duplicates.** A row is a duplicate when its order ID matches an existing order's `external_ref`, or, with no order ID, when the hash of (phone, order date, product, quantity, price) matches an existing order or an earlier row in the same file. |
| FR-IMP-07 | **Multi-item orders.** Rows sharing an order ID become one order with several items. Without an order ID, each row is one order. |
| FR-IMP-08 | **Product matching.** By SKU, then by exact name (case-insensitive, trimmed). Unmatched products are created automatically with the row's price and cost. With no cost column the cost is 0 and the product is flagged "Cost missing". |
| FR-IMP-09 | **Preview.** Shows counts (`237 rows detected: 225 valid, 8 duplicate, 4 invalid`), a table of the first rows per group with reasons, and a downloadable file of the rejected rows. The button reads `Import 225 Orders`. |
| FR-IMP-10 | **Commit.** All valid rows are inserted in one database transaction; a failure leaves nothing behind. Customers are created or matched by phone. Imported orders are marked `source = import` with the `import_id`. |
| FR-IMP-11 | **After import.** A result screen with a link to the dashboard for the imported date range, and a prompt to fill in missing product costs when any exist (a single screen listing those products with a cost input each). |
| FR-IMP-12 | **Undo.** An import can be undone from the import history: this deletes exactly the orders created by that import, plus customers and products that the import created and that have no other orders. |
| FR-IMP-13 | Imports run synchronously in V1; 5,000 rows must finish in under 20 seconds. The row limit exists to keep this true. |

### 5.8 Profit dashboard

| ID | Requirement |
|---|---|
| FR-DASH-01 | Period selector: this month (default), last month, last 7 days, last 30 days, custom range. The choice is kept in the URL so the page is shareable and SSR-rendered correctly. |
| FR-DASH-02 | Profit statement for the period: Sales, Product Cost, Courier, Ads, Other Expenses, **Net Profit**, exactly as defined in section 6. |
| FR-DASH-03 | KPI cards: Revenue, Gross Profit, Net Profit, Profit Margin, Orders, Delivered, Returned, Return Rate, Average Order Value. Each money card shows the change against the previous equal-length period. |
| FR-DASH-04 | Profit trend chart: revenue and net profit per day for ranges up to 62 days, per month beyond that. |
| FR-DASH-05 | Top products: top five by profit, with a link to the full product profitability report. |
| FR-DASH-06 | Insights, rule-based, at most three shown, most severe first: return rate above 10%; ad spend up more than 20% on the previous period; net profit down while revenue is up; products with missing cost (with the count and a fix link); expenses not entered for this period. |
| FR-DASH-07 | Every number is clickable and opens the list that produces it: Product Cost opens the product report, Courier opens orders in the period, Ads opens the expense list filtered by category. |
| FR-DASH-08 | Empty state: with no data the dashboard shows the onboarding checklist and an "Import your orders" call to action instead of zeros. |
| FR-DASH-09 | Data-quality banner whenever profit is known to be overstated: "12 products have no cost. Your profit is shown higher than it really is." |

### 5.9 Product profitability

| ID | Requirement |
|---|---|
| FR-PP-01 | Table per product for the period: units sold, sales, cost, profit, margin, units returned. Sortable by every column, default sort by profit descending. |
| FR-PP-02 | Highlights above the table: most profitable product, highest revenue product, lowest margin product (minimum five units sold). When the top revenue product is not the top profit product, a line says so. |
| FR-PP-03 | An order-level discount is split across the order's items in proportion to each line total. |
| FR-PP-04 | Courier, packaging and ad costs are not allocated to products in V1. The page states this. Ad-cost allocation arrives with V2 marketing analytics. |
| FR-PP-05 | Filter by category; search by name or SKU. |

### 5.10 Basic reports

| ID | Requirement |
|---|---|
| FR-REP-01 | Monthly profit report: one row per month for the last 12 months with the full profit statement. |
| FR-REP-02 | Product profit report (the section 5.9 table). |
| FR-REP-03 | Expense report by category and month. |
| FR-REP-04 | Each report exports to CSV with UTF-8 BOM so Bangla opens correctly in Excel. PDF and XLSX exports are V2. |

---

## 6. Profit calculation specification

This is the core of the product. It lives in one module (`profit/`), is a set of pure functions over query results, and has the highest test coverage in the codebase. **Profit is never stored; it is always derived from orders, order items and expenses.**

### 6.1 Which orders count

| Status | Revenue | Product cost | Courier + packaging cost | Return cost |
|---|---|---|---|---|
| `delivered` | Yes | Yes | Yes | No |
| `returned` | No | No (the goods come back) | Yes | Yes |
| `new`, `confirmed`, `processing`, `shipped` | No (shown separately as "pending") | No | No | No |
| `cancelled` | No | No | No | No |

An order belongs to a period by its **`order_date`**, in the business timezone. This is the one date every import can supply. A setting to attribute by delivery date instead is a V2 candidate.

### 6.2 Formulas

For a period `P`, with `D` = delivered orders and `R` = returned orders dated in `P`:

```
product_sales   = Σ over D of (subtotal − discount)
delivery_income = Σ over D of delivery_charge
revenue         = product_sales + delivery_income

product_cost    = Σ over items of D of (quantity × unit_cost)

courier_cost    = Σ over D ∪ R of (courier_cost + packaging_cost)
                + Σ over R of return_cost
                + Σ expenses in P where category.kind = 'courier'

ads_cost        = Σ expenses in P where category.kind = 'ads'
other_expenses  = Σ expenses in P where category.kind = 'other'

gross_profit    = product_sales − product_cost
net_profit      = revenue − product_cost − courier_cost − ads_cost − other_expenses

profit_margin   = net_profit ÷ revenue                 (0 when revenue = 0)
return_rate     = count(R) ÷ (count(D) + count(R))     (0 when the denominator is 0)
avg_order_value = revenue ÷ count(D)
orders          = count of non-cancelled orders in P
```

Check against the reference dashboard: `5,20,000 − 3,00,000 − 35,000 − 50,000 − 15,000 = 1,20,000`, margin `23.1%`.

### 6.3 Product-level formulas

For product `p`, over items in delivered orders in `P`:

```
allocated_discount(item) = order.discount × item.line_total ÷ order.subtotal
sales(p)   = Σ (item.line_total − allocated_discount(item))
cost(p)    = Σ (item.quantity × item.unit_cost)
profit(p)  = sales(p) − cost(p)
margin(p)  = profit(p) ÷ sales(p)
```

Rounding: allocation is done in poisha with the remainder assigned to the largest line, so the products always sum exactly to the order.

### 6.4 Customer-level and order-level profit

```
order_profit (delivered) = total − product_cost − courier_cost − packaging_cost
order_profit (returned)  = −(courier_cost + packaging_cost + return_cost)
customer_profit          = Σ order_profit over the customer's delivered and returned orders
```

### 6.5 Implementation notes

- Aggregates run as SQL `SUM`/`COUNT` queries filtered by `business_id`, status and date; nothing is summed in JavaScript row by row.
- `orders.product_cost` is a stored column kept equal to the sum of its items, updated in the same transaction as any item change. It is a cache of transactional data, not a stored profit.
- Target: dashboard aggregates under 300 ms for a business with 50,000 orders. If this stops holding, add a daily summary table then, not before.
- Required unit tests: each status row of the table in 6.1, discount allocation rounding, a period boundary at midnight Dhaka time, zero revenue, a returned order with return cost, expense kinds, and the reference dashboard figures above.

---

## 7. Data model (V1)

All tables have `id UUID PK`, `created_at`, `updated_at`. Money columns are `BIGINT` poisha. No profit is stored.

```
users ──< business_members >── businesses
                                   │
        ┌──────────┬──────────┬────┴─────┬───────────┬──────────┐
     categories  products  customers  couriers   expenses    imports
                    │          │         │      (→ expense_   │
                    │          └──< orders >──┘   categories) └──< import_rows
                    │                 │
                    └──< order_items >┘        orders ──< order_status_history
```

### 7.1 Tables

**users** — `name`, `email` (unique, nullable), `phone` (unique, nullable), `password_hash`, `locale` (`bn`/`en`), `email_verified_at`, `phone_verified_at`. Check: email or phone is present.

**sessions** — `user_id`, `token_hash` (unique), `expires_at`, `revoked_at`, `ip`, `user_agent`, `last_used_at`.

**password_resets** — `user_id`, `channel` (`email`/`sms`), `token_hash`, `expires_at`, `used_at`, `attempts`.

**businesses** — `owner_id`, `name`, `logo_url`, `phone`, `address`, `city`, `business_type`, `facebook_page_url`, `currency` (default `BDT`), `timezone` (default `Asia/Dhaka`), `default_courier_id`, `default_courier_cost`, `default_return_cost`, `default_packaging_cost`, `next_order_no`, `onboarding` (jsonb).

**business_members** — `business_id`, `user_id`, `role` (`owner` only in V1). Unique (`business_id`, `user_id`).

**categories** — `business_id`, `name`. Unique (`business_id`, `name`).

**products** — `business_id`, `category_id` (nullable), `name`, `sku`, `selling_price`, `cost_price`, `stock` (int), `status`. Unique (`business_id`, `sku`).

**customers** — `business_id`, `name`, `phone`, `address`, `city`, `note`. Unique (`business_id`, `phone`).

**couriers** — `business_id`, `name`, `default_cost`, `default_return_cost`, `is_active`.

**orders** — `business_id`, `order_no`, `customer_id`, `courier_id` (nullable), `status`, `payment_method`, `order_date` (date), `delivery_address`, `subtotal`, `discount`, `delivery_charge`, `total`, `product_cost`, `courier_cost`, `packaging_cost`, `return_cost`, `note`, `source` (`manual`/`import`), `import_id` (nullable), `external_ref` (nullable), `dedupe_hash` (nullable), `delivered_at`, `returned_at`, `created_by`. Unique (`business_id`, `order_no`); unique (`business_id`, `external_ref`) where not null.

**order_items** — `order_id`, `business_id`, `product_id`, `product_name`, `sku`, `quantity`, `unit_price`, `unit_cost`, `line_total`.

**order_status_history** — `order_id`, `business_id`, `from_status`, `to_status`, `changed_by`, `changed_at`.

**expense_categories** — `business_id`, `name`, `kind` (`ads`/`courier`/`other`), `is_system`.

**expenses** — `business_id`, `category_id`, `amount`, `expense_date` (date), `note`, `created_by`.

**imports** — `business_id`, `type` (`orders`/`products`), `file_name`, `file_key`, `status` (`uploaded`/`mapped`/`validated`/`imported`/`undone`/`failed`), `mapping` (jsonb), `status_mapping` (jsonb), `total_rows`, `valid_rows`, `duplicate_rows`, `invalid_rows`, `imported_rows`, `created_by`.

**import_rows** — `import_id`, `business_id`, `row_number`, `raw` (jsonb), `normalized` (jsonb), `status` (`valid`/`duplicate`/`invalid`), `errors` (jsonb), `order_id` (nullable).

### 7.2 Indexes

Only where a known query needs them:

- `orders (business_id, order_date, status)` — every dashboard and report aggregate
- `orders (business_id, customer_id)` — customer stats and profile
- `orders (business_id, dedupe_hash)` — import duplicate check
- `order_items (order_id)` and `order_items (business_id, product_id)` — order detail, product profitability
- `expenses (business_id, expense_date)` — expense totals per period
- `import_rows (import_id, status)` — import preview

The unique constraints above cover the remaining lookups (SKU, phone, order number).

### 7.3 Columns reserved for later versions

Present in V1 so V2 does not require a rebuild, unused by V1 screens: `orders.courier_id`, `orders.return_cost`, `orders.delivered_at`, `orders.returned_at`, `orders.external_ref`, `couriers.default_return_cost`, `expense_categories.kind`. V2 adds `cod_amount`, `cod_charge`, `tracking_code`, `return_reason` and the settlement tables.

---

## 8. API specification

Base path `/v1`, JSON, session-cookie authentication. Everything below except `/auth/*` requires a session and is scoped to the session's business.

### 8.1 Conventions

- List endpoints: `?page=1&per_page=25&sort=-created_at&q=…` → `{ "data": [...], "meta": { "page", "per_page", "total" } }`
- Single resources: `{ "data": {...} }`
- Errors: `{ "error": { "code": "validation_failed", "message": "…", "fields": { "phone": ["…"] } } }`
- Status codes: `400` malformed, `401` not logged in, `403` not allowed, `404` not found or belongs to another business, `409` conflict (duplicate SKU or phone), `422` validation, `429` rate limited
- Money is sent and received as integer poisha. Formatting happens in the web app.
- Mutating requests require a CSRF token header (double-submit cookie).

### 8.2 Endpoints

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register` · `POST /auth/login` · `POST /auth/logout` · `POST /auth/logout-all` · `POST /auth/forgot-password` · `POST /auth/reset-password` · `GET /auth/me` · `PATCH /auth/me` · `POST /auth/change-password` |
| Business | `GET /business` · `PATCH /business` · `POST /business/logo` |
| Couriers | `GET /couriers` · `POST /couriers` · `PATCH /couriers/:id` |
| Categories | `GET /categories` · `POST /categories` · `PATCH /categories/:id` · `DELETE /categories/:id` |
| Products | `GET /products` · `POST /products` · `GET /products/:id` · `PATCH /products/:id` · `POST /products/:id/archive` · `GET /products/:id/prices` · `GET /products/prices-on?ids=&date=` · `GET /products/missing-cost` · `PATCH /products/bulk-cost` |
| Customers | `GET /customers` · `POST /customers` · `GET /customers/:id` · `PATCH /customers/:id` · `GET /customers/lookup?phone=` |
| Orders | `GET /orders` · `POST /orders` · `GET /orders/:id` · `PATCH /orders/:id` · `POST /orders/:id/status` · `POST /orders/bulk-status` · `GET /orders/status-counts` |
| Expenses | `GET /expense-categories` · `POST /expense-categories` · `PATCH /expense-categories/:id` · `DELETE /expense-categories/:id` · `GET /expenses` · `POST /expenses` · `PATCH /expenses/:id` · `DELETE /expenses/:id` |
| Imports | `POST /imports` (upload) · `GET /imports` · `GET /imports/:id` · `PUT /imports/:id/mapping` · `POST /imports/:id/validate` · `GET /imports/:id/rows?status=` · `GET /imports/:id/rejected.csv` · `POST /imports/:id/commit` · `POST /imports/:id/undo` · `GET /imports/template.xlsx` |
| Profit | `GET /profit/summary?from=&to=` (statement, KPIs, previous-period comparison) · `GET /profit/trend?from=&to=&interval=day\|month` · `GET /profit/insights?from=&to=` · `GET /profit/products?from=&to=` |
| Reports | `GET /reports/monthly-profit` · `GET /reports/product-profit` · `GET /reports/expenses` (each with `?format=json\|csv`) |

### 8.3 Example

`GET /v1/profit/summary?from=2026-09-01&to=2026-09-30`

```json
{
  "data": {
    "period": { "from": "2026-09-01", "to": "2026-09-30" },
    "statement": {
      "product_sales": 49000000,
      "delivery_income": 3000000,
      "revenue": 52000000,
      "product_cost": 30000000,
      "courier_cost": 3500000,
      "ads_cost": 5000000,
      "other_expenses": 1500000,
      "gross_profit": 19000000,
      "net_profit": 12000000
    },
    "kpis": {
      "profit_margin": 23.1,
      "orders": 420,
      "delivered": 360,
      "returned": 60,
      "return_rate": 14.3,
      "avg_order_value": 144444
    },
    "previous": { "revenue": 44000000, "net_profit": 11200000 },
    "data_quality": { "products_missing_cost": 0, "expenses_entered": true }
  }
}
```

---

## 9. Screens (V1)

| Route | Screen | Key elements |
|---|---|---|
| `/` | Landing | Bangla-first value proposition, sample dashboard, sign-up call to action |
| `/register`, `/login`, `/forgot-password`, `/reset-password` | Auth | Single-column forms, large touch targets |
| `/dashboard` | Profit dashboard | Period selector, profit statement, KPI cards, trend chart, top products, insights, data-quality banner |
| `/products`, `/products/new`, `/products/[id]` | Products | List with margin column, form with live profit preview |
| `/products/missing-cost` | Fix costs | One row per product, one input each, save all |
| `/orders`, `/orders/new`, `/orders/[id]` | Orders | Status tabs with counts, bulk status bar, order form with customer lookup, per-order profit breakdown |
| `/customers`, `/customers/[id]` | Customers | Stats list, profile with history |
| `/expenses` | Expenses | Month view grouped by category, quick-add dialog |
| `/imports`, `/imports/new`, `/imports/[id]` | Import | Four-step wizard, history with undo |
| `/reports/monthly-profit`, `/reports/products`, `/reports/expenses` | Reports | Tables with CSV export |
| `/settings/business`, `/settings/couriers`, `/settings/profit`, `/settings/account` | Settings | |

UI requirements:

- **Mobile first.** Designed at 360 px wide. Bottom tab navigation on mobile (Dashboard, Orders, Add, Products, More); sidebar from 1024 px.
- Tables turn into stacked cards under 640 px.
- Every list has loading skeletons, an empty state with a next action, and an error state with retry.
- Destructive or irreversible actions (cancel order, undo import) require confirmation.
- Bangla typography: Hind Siliguri or Noto Sans Bengali, minimum 14 px body.
- Profit is green when positive and red when negative, always with a sign or label so colour is not the only signal.

---

## 10. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance | Dashboard server response under 800 ms at p95 for 50,000 orders. Largest Contentful Paint under 2.5 s on a mid-range Android phone over 4G. Initial JavaScript for app pages under 200 KB gzipped. |
| Security | Argon2id hashing; httpOnly session cookies; CSRF protection on mutations; rate limiting on auth; input validated by Zod on every endpoint; Prisma parameterised queries only; security headers (CSP, HSTS, `X-Frame-Options`); uploads checked by content type and size, stored outside the web root. |
| Tenant isolation | Enforced in the repository layer and the Prisma extension (section 3.5), with a cross-tenant test per table. |
| Privacy | Customer phone numbers and addresses are personal data: no third-party analytics receives them; logs never contain phone numbers, addresses or passwords. A seller can export and delete all their business data. |
| Reliability | Nightly PostgreSQL backup to off-server storage, 14-day retention, restore tested once before launch. Imports are transactional. |
| Observability | Structured JSON logs with a request ID; error tracking (Sentry); uptime check on `/health`. |
| Compatibility | Latest two versions of Chrome, Safari, Firefox, Samsung Internet. Android Chrome is the primary target. |
| Accessibility | Labels on all inputs, keyboard-navigable, contrast at WCAG AA. |
| Maintainability | TypeScript strict; ESLint and Prettier in CI; no business logic in controllers or React components. |
| Testing | Profit module at 100% branch coverage. API tests for auth, tenancy, orders and import. One Playwright path: register → import sample file → see profit. |

---

## 11. V1 delivery plan

Fifteen working sessions. Built beside a full-time job this is tight; the cut order below says what to drop first.

| Day | Deliverable | Requirements |
|---|---|---|
| 1 | Monorepo, Docker Compose, Prisma schema and migrations, seed, CI, register/login/logout | FR-AUTH-01–05 |
| 2 | Tenant guard, business profile, couriers, categories, products CRUD with margin preview | FR-BIZ, FR-PROD-01–05 |
| 3 | Customers; order create with customer lookup and item snapshots | FR-CUST-01–03, FR-ORD-01–05 |
| 4 | Order list, status flow, bulk status, stock adjustment; expenses | FR-ORD-06–11, FR-EXP |
| 5 | Profit module with full unit tests | Section 6 |
| 6 | Profit API: summary, trend, insights, products | FR-DASH, FR-PP |
| 7 | Dashboard UI with SSR and streaming | FR-DASH-01–09 |
| 8 | Import: upload, parsing, column mapping, status mapping | FR-IMP-01–04 |
| 9 | Import: validation, duplicates, preview, commit, undo, missing-cost screen | FR-IMP-05–13 |
| 10 | Product profitability page, customer profile | FR-PP, FR-CUST-04 |
| 11 | Reports and CSV export | FR-REP |
| 12 | Mobile polish, Bangla translations, empty and error states | Section 9 |
| 13 | Onboarding checklist, landing page, password reset | FR-BIZ-05, FR-AUTH-06 |
| 14 | Deployment, backups, error tracking, end-to-end test, bug fixing | Section 10 |
| 15 | Launch to the first sellers | |

**Cut order if time runs out:** SMS password reset → product bulk import → expense report → logo upload → English locale → previous-period comparison → bulk status update. **Never cut:** import, profit dashboard, product profitability, the profit tests.

**In parallel from day 3:** contact 20 Facebook sellers in Dhaka with the offer "আপনার গত ৩০ দিনের order data দিলে আমি free-তে দেখিয়ে দিতে পারি আপনার আসল profit কত এবং কোথায় বেশি টাকা loss হচ্ছে." Their real files are the test data for days 8 and 9; build the header synonym list (FR-IMP-02) from them.

### 11.1 V1 acceptance checklist

- [ ] A new user registers and lands on a dashboard with the onboarding checklist.
- [ ] Uploading the sample file of 237 rows shows 225 valid, 8 duplicate, 4 invalid and imports 225 orders.
- [ ] Uploading the same file again reports every row as a duplicate.
- [ ] Undoing the import removes exactly those orders.
- [ ] The dashboard reproduces the reference figures: revenue ৳5,20,000, net profit ৳1,20,000, margin 23.1%.
- [ ] Changing an order from delivered to returned moves its revenue out and its return cost in.
- [ ] Changing a product's price or cost never changes past profit; an order dated before the change uses the old price.
- [ ] Business A cannot fetch any record of business B by ID.
- [ ] The dashboard is usable on a 360 px phone and its first render is server-side.
- [ ] CSV exports open in Excel with correct Bangla text.

---

## 12. Later versions

Start each only when the previous one has real users. Detailed requirements are written when that version begins.

### 12.1 V2 — the seller operating system (1–2 months, after 20–50 active sellers)

| ID | Feature | Requirement summary |
|---|---|---|
| FR-V2-01 | Courier management | Per-courier dashboard: orders, delivered, returned, return rate, cost. Comparison table across couriers. Data from manual entry and courier CSV exports, no APIs yet. |
| FR-V2-02 | COD reconciliation | Record a courier payout (date, amount, the orders it covers, by upload or selection). Show expected COD against received, the difference, and its breakdown: delivery charge, COD charge, returns, pending, unexplained. Flag orders delivered but not settled after N days. |
| FR-V2-03 | Return management | Return reason, return charge and packaging loss per returned order; monthly statement "returns cost you ৳18,400 this month"; breakdown by product, courier and area. |
| FR-V2-04 | Customer risk indicator | Low / medium / high from the customer's own delivered and returned history with this seller. Shown when creating a COD order, with a suggestion to request partial advance payment. Worded as a risk indicator, never as an accusation of fraud, and never shared between sellers. |
| FR-V2-05 | Customer segments | New, returning, VIP, inactive; share of revenue from repeat customers; list of customers with 2+ purchases and none in 60 days. |
| FR-V2-06 | Marketing analytics | Ad spend by day or campaign (entry or import), ROAS, profit after ads, optional allocation of ad spend to products. |
| FR-V2-07 | Alerts | Scheduled checks: return rate, margin below threshold, courier loss, repeat revenue change. In-app plus optional email. |
| FR-V2-08 | Reports and exports | Daily sales, monthly profit, product profit, courier, returns, customers, expenses, COD settlement; PDF, XLSX, CSV. |
| FR-V2-09 | Platform admin | Internal view of sign-ups, activity and import failures. |

New infrastructure: Redis and BullMQ for background imports (removing the 5,000-row limit), scheduled alerts and PDF generation. New tables: `courier_settlements`, `courier_settlement_items`, `ad_spends`, `alerts`.

### 12.2 V3 — AI business copilot (3–6 months)

AI is built on the seller's own data, not added as a generic chatbot. Model access goes through one `AiProvider` interface (Claude API). The model never calculates figures itself: it calls typed tools backed by the profit module and explains the results, and every figure it states links to its source report.

| ID | Feature | Requirement summary |
|---|---|---|
| FR-V3-01 | AI Business Doctor | "Analyze my business": a written monthly diagnosis in Bangla or English covering revenue against profit, return cost, product margin and repeat customers. |
| FR-V3-02 | AI product advisor | Answers "which product should I advertise?" by showing revenue, margin and return rate per candidate and explaining the recommendation from those numbers. |
| FR-V3-03 | Profit forecast | Next-month revenue and profit as a range from the last three or more months, with the uncertainty stated. Hidden when there is less than three months of data. |
| FR-V3-04 | Screenshot to data | Upload a courier, Facebook Ads or spreadsheet screenshot; extracted values are shown for the seller to review and confirm before anything is saved. |
| FR-V3-05 | Business chat | Questions in Bangla, English or mixed, answered from the seller's database through read-only tools scoped to that business. |
| FR-V3-06 | Monthly report | Generated automatically on the first of each month, delivered in-app and by email, with the AI explanation. |
| FR-V3-07 | AI alerts | V2 alerts with a short explanation of the likely cause. |

Requirements specific to V3: per-business usage limits and cost tracking; customer phone numbers and addresses are not sent to the model unless the question requires them; tool calls are restricted to the session's business; prompts and responses are logged for quality review with personal data removed.

### 12.3 V4 — commerce infrastructure (6–18 months)

| ID | Feature |
|---|---|
| FR-V4-01 | Courier API integrations: Pathao, Steadfast, RedX, Paperfly, Carrybee — create consignments, receive tracking and status updates |
| FR-V4-02 | Facebook and Instagram integration: page orders, leads, ad spend sync |
| FR-V4-03 | bKash / Nagad / Rocket / card payment reconciliation |
| FR-V4-04 | Inventory: purchases, suppliers, low-stock alerts, stock adjustments (not a full ERP) |
| FR-V4-05 | Multi-store: several pages, a website, Daraz and a physical shop under one account |
| FR-V4-06 | Team management: roles and permissions (view, create, edit, delete, reports, financial data) on the existing `business_members` table |
| FR-V4-07 | Public REST API, API keys, webhooks |
| FR-V4-08 | Integrations ecosystem |

---

## 13. Risks and open decisions

| # | Item | Position taken in this document | Revisit when |
|---|---|---|---|
| 1 | Sellers do not know their product cost, so profit is wrong | Cost 0 is allowed but flagged everywhere, with a one-screen fix | The first imports show how common it is |
| 2 | Real seller spreadsheets are messier than the import expects | Synonym list and status mapping are built from real files gathered from day 3 | After the first 10 real files |
| 3 | Revenue attributed by order date, not delivery date | Order date, because imports always have it | Sellers report that month totals feel wrong |
| 4 | Courier cost entered both per order and as a lump-sum expense | Warning on entry (FR-EXP-05) | Support questions show confusion |
| 5 | Returned goods assumed to return to stock at no product loss | Yes in V1; damaged returns are handled in V2 return management | V2 |
| 6 | SMS gateway for phone-only accounts | Behind an interface; email required if none is configured at launch | Before launch |
| 7 | Pricing | Not defined here; V1 is free for the first sellers | After 20 active sellers |
| 8 | Fifteen days alongside a full-time job | Cut order in section 11 | Day 7 checkpoint |
| 9 | Product name "Hishab" is close to an existing competitor's name | Check trademark and domain availability before public launch | Before launch |
