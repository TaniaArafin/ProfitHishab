# CLAUDE.md

Guidance for working in this repository. Requirements live in [SRS.md](SRS.md); how to run things is in [README.md](README.md).

ProfitHishab: profit intelligence for Bangladeshi Facebook sellers. Next.js (React, server-rendered) web app, NestJS + Prisma + PostgreSQL API, shared Zod/TypeScript package. npm workspaces.

## Engineering standard

Sources, in this order of authority for their area:
- **Architecture, data, HTTP, tests:** the `laravel-skill` set, translated below.
- **React:** react.dev, especially "Rules of React" and "You Might Not Need an Effect".
- **Next.js:** the official docs, especially the App Router production checklist (nextjs.org/docs/app/guides/production-checklist).
- **Node operations, security, Docker:** Node.js Best Practices (github.com/goldbergyoni/nodebestpractices); item numbers like `nbp 5.14` refer to it.

Before every change, run `npm run check` (format, lint, type-check, all unit/component/API tests). Run `npm run test:e2e` when a user flow changes.

The architecture rules come from the `laravel-skill` set (`~/.agents/skills/laravel-{patterns,rest-api,eloquent,testing,async}`), translated to Node. Where a rule is cited below, its slug is in brackets so you can open `rules/<slug>.md` for the reasoning. **Read the relevant skill rule before writing code in that area**; the translation table below says what the Laravel term means here.

Precedence: the user's instruction in the current turn → this file → the skill rules → general habit.

### Term translation

| Laravel skill says | Here it means |
|---|---|
| Domain (`app/Domain/<X>`) | A Nest module: `apps/api/src/modules/<x>/` |
| Action | A method on the module's service that runs one use case (`OrdersService.create`) |
| Repository / Query Class | `<x>.repository.ts`: every Prisma call and every raw SQL statement |
| Form Request + DTO | A Zod schema in `packages/shared/src/schemas.ts`, applied with `zod(schema)` in the controller; the parsed value is the DTO |
| API Resource | `<x>.presenter.ts`: pure functions from rows to the DTO types in `packages/shared/src/types.ts` |
| Exception handler | `common/http-exception.filter.ts` |
| Policy / tenancy scope | `businessId` from `@Auth()` (the session), passed to every repository method |
| `config()` / `env()` | `config()` in `apps/api/src/config.ts`, the only reader of `process.env` |
| Eloquent cast / enum | Shared Zod enums + a Postgres `CHECK` constraint in the migration |
| `lockForUpdate()` | `OrdersRepository.lockForUpdate()` (`SELECT … FOR UPDATE` in a transaction) |
| Pest feature test | Jest + supertest in `apps/api/test/*.e2e-spec.ts` against the real test database |

## API rules (apps/api)

**Layering**
- Controllers parse input (Zod pipe), call one service method or one repository method, and return `{ data }`. No queries, no branching on business rules [controller-thin-delegates-to-action] [controller-no-query-construction].
- A read with no rule (a list, a lookup) goes controller → repository → presenter. Do not add a service method that only forwards [action-not-a-pass-through] [service-not-a-disguised-repository].
- Anything with a rule, more than one repository call, or a write that touches several tables goes through the service.
- Every Prisma call and raw SQL statement lives in a repository [raw-only-inside-query-classes]. Services never import `PrismaService`.
- A list endpoint is a named, paginated repository method with a composite filter object [gate-reads-go-through-a-named-query] [vo-composite-filter-per-query] [paginate-always-paginate-lists].
- Keep repositories focused; split by concept when one grows past ~10 methods (see `categories.repository.ts`) [repo-small-focused-interface].

**Module boundaries** [domain-no-cross-domain-models]
- A module never imports another module's repository. It calls the other module's exported service, which returns plain DTOs, never Prisma models.
- Module `exports` lists only the service. Current public surfaces: `BusinessService.orderDefaults / reserveOrderNo / assertCourierBelongs / createForOwner / profile`, `ProductsService.productsForOrder / moveStock`, `CustomersService.findOrCreateForOrder`, `ExpensesService.seedDefaultCategories`.
- Cross-module writes in one transaction pass the `Tx` handle down.
- Deliberate exception: `ProfitRepository` and the customer stats query read `orders`, `order_items`, `products` and `expenses` with SQL. Profit and customer stats are read-only reporting over the shared schema; they never write another module's tables.

**Tenancy and authorization** [authz-never-trust-request-ids]
- `businessId` always comes from `@Auth()`, never from a body, query or URL.
- Every repository method that takes an id also takes `businessId` and filters by it. A foreign id is a 404, never a 403 (no existence leak).
- Every new tenant-owned table gets a case in the cross-tenant test in `test/app.e2e-spec.ts`.

**Validation** [request-validation-in-form-requests] [request-prepare-for-validation-normalizes]
- One Zod schema per payload in `packages/shared`, shared with the web form. Normalise in the schema (phone numbers, empty strings).
- An omitted optional field stays `undefined` (untouched on update); an empty string clears it.

**Errors** [error-named-constructors] [error-map-status-centrally] [error-never-leak-internals]
- Each module has `<x>.errors.ts` with one class and a static named constructor per failure mode (`OrderError.discountExceedsSubtotal()`). Never throw a bare `Error` or Nest `HttpException` for a business rule.
- The exception filter is the only place that turns errors into HTTP responses, including CSRF failures from middleware.
- 5xx responses carry a generic message; the detail goes to the log.

**Transactions and data** [tx-wrap-multi-step-writes] [tx-keep-transactions-short] [tx-lock-for-update-on-contention]
- Multi-table writes run in one `$transaction`. No hashing, HTTP or file work inside it (hash passwords before opening it).
- Read-then-modify on a row that can be changed concurrently locks it first (`lockForUpdate`, ids in sorted order).
- Batch writes over many rows are one statement, not a loop (`ProductsRepository.adjustStock`) [bulk-upsert-instead-of-loop].
- Existence checks select one id; never `count()` for a boolean [perf-exists-not-count].
- Sort keys go through an allow-list; values always go through Prisma bindings, never string interpolation [query-whitelist-sortable-columns] [raw-never-interpolate-user-input].
- Every status-like text column has a `CHECK` constraint matching `packages/shared/src/enums.ts`; money columns are checked `>= 0`. Change both together.

**Money and time**
- Money is integer poisha everywhere (`৳2,500` = `250000`). Columns are `INT` (not the SRS's `BIGINT`, which Prisma returns as JS `bigint`); aggregates are cast to `float8` in SQL.
- Store UTC; dates are `YYYY-MM-DD` in the business timezone (`Asia/Dhaka`); convert only at the edge [model-immutable-dates-and-timezones].
- Profit is never stored. It is derived by `profit.calculator.ts` (pure functions) from SQL aggregates.
- Prices are history, not a field: every selling-price or cost change writes a `product_prices` row effective from today (business timezone). Order lines snapshot `unitPrice`/`unitCost` from the row in effect on the order date (`ProductPricesRepository.on`). Never rewrite a past order's snapshot.

**Search**
- Product search goes through `ProductSearch` (Typesense). It stores only `businessId`, `name`, `sku`, `status`; Postgres stays the source of truth: search returns ids, then SQL filters, sorts, pages and reads fresh prices and stock. Always filter on `businessId` inside `ProductSearch`.
- Call `search.index([ids])` after any write that changes an indexed field. A failed sync is logged, not thrown; the boot check rebuilds a drifted index. Changing the collection fields means bumping `SCHEMA_VERSION`.
- When Typesense is down or `SEARCH_DRIVER=postgres`, `ids()` returns null and the list falls back to `ILIKE`. Tests use Postgres unless `TEST_TYPESENSE_URL` is set (CI sets it).
- Use `127.0.0.1`, not `localhost`, in `TYPESENSE_URL`: Node resolves `localhost` to IPv6 first and Docker may only forward IPv4.

**Idempotency** [controller-idempotency-key-on-unsafe-writes]
- `POST /orders` requires an `Idempotency-Key` header (8–100 chars). Same key + same body replays the original order; same key + different body is 409. Keys are scoped per business. Add the same treatment to any new create endpoint a phone may retry.

**Config** [config-never-env-outside-config]
- Add a variable to the Zod schema in `config.ts` and to `apps/api/.env.example`. Nothing else reads `process.env`.

**Migrations** [migration-never-edit-a-deployed-migration]
- `prisma migrate dev` refuses to run non-interactively. Generate SQL with `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <shadow db> --script`, write it to a new `prisma/migrations/<timestamp>_<name>/migration.sql`, add any `CHECK` constraints by hand, then `prisma migrate deploy` on the dev and test databases.
- Foreign keys are real constraints with an explicit `onDelete` [migration-constrained-foreign-keys]. (st-inventory-pos forbids FKs; this project does not.)

## Testing (apps/api)

Per layer [strategy-layer-to-test-type]:

| Layer | Test |
|---|---|
| Pure rules (`profit.calculator.ts`, `login-attempts.ts`, `packages/shared`) | Unit test, no database, time passed in [fake-time-and-randomness] |
| Endpoint, repository query, transaction | e2e against `profithishab_test` via `test/helpers.ts` |

Every e2e change covers: unauthenticated, another business's record, the payload shape including keys that must not appear [http-assert-authorization] [http-assert-payload-shape]; for queries, what is excluded as well as included [db-assert-inclusion-and-exclusion]; for writes, rollback on failure and repeat-safety [db-test-transactions-and-idempotency]. `test/rules.e2e-spec.ts` names the rule each test proves.

Run: `npm test` from the root. All of it must pass before finishing a change.

## Web rules (apps/web)

**Rendering (Next.js checklist)**
- Pages are server components that fetch with `apiGet()` (cookies forwarded, 10 s timeout) and fetch independent data in parallel with `Promise.all`. Keep `'use client'` at the leaves: only the interactive part of a page is a client component.
- No route-level `loading.tsx`: pages render in tens of ms, and swapping a skeleton for content adds React's ~300 ms reveal throttle to every click. The sidebar highlights the clicked item at once and shows a top progress bar until the page arrives. Slow sections inside a page get their own `<Suspense>` with a skeleton.
- No client router cache (`staleTimes`): every navigation renders fresh. After a write, `navigateFresh(router, href)` (just `push`) or `refreshData(router)` (just `refresh`) from `lib/navigation.ts`; never `push()` followed by `refresh()`, which can cancel the navigation.
- Errors: `app/(app)/error.tsx` per segment, `app/global-error.tsx` for the root layout, `app/not-found.tsx` for 404s.
- Heavy client libraries load lazily (`TrendChartLazy`).
- Only public values may use `NEXT_PUBLIC_`; `API_URL` is server-only.

**React (react.dev)**
- Derive values during render; never mirror props or state into new state with an Effect. Order totals come from `orderTotals()` on every render.
- User-caused logic goes in event handlers. Effects only synchronise with something outside React (network, timers).
- Fetching in an Effect goes in a custom hook in `lib/hooks.ts`, and every one ignores responses that arrive after its inputs changed (`let ignore = false` cleanup).
- To adjust state when an input changes, do it during render with a guard (see the address prefill in `OrderForm`), or reset the subtree with a `key`.
- Expensive initial values use lazy initialisers (`useState(() => crypto.randomUUID())`).
- List keys are stable ids, never array indexes for lists that can change.
- Components stay small and single-purpose; a form over ~200 lines is split into sections (`orders/new/*`).
- Read which button submitted a form from `event.nativeEvent.submitter`, not a ref.

**Accessibility**
- Every control has a label; icon-only buttons have `aria-label`. `jsx-a11y` runs in lint.
- Custom widgets follow the WAI-ARIA pattern for their role (`ProductPicker` is a combobox: arrow keys, Enter, Escape).
- Destructive actions confirm in-page (no `window.confirm`). Colour is never the only signal: profit and loss also carry a sign.

**Styling and data**
- Colours come only from `lib/theme-colors.ts` (Tailwind and charts both import it). No hex values in components.
- UI primitives come from shadcn/ui (`components/ui/*`, config in `components.json`, Tailwind v3 so CLI `shadcn@2.3.0`), themed with the schist tokens. Dropdowns use `SelectField`, never a native `<select>`.
- Money is typed in taka and parsed with `parseTaka` from `@ph/shared`.
- Create requests a phone might retry send an `Idempotency-Key`, generated once per form and renewed after success.

**Tests**
- Components and hooks: Vitest and Testing Library (`*.test.tsx` beside the file). Query by role and label, as a user would; mock `@/lib/client-api`, never `fetch`.
- User flows: Playwright in `apps/web/e2e`, desktop and phone. Each run registers a fresh seller.

## Node operations (nodebestpractices)

- Errors: domain errors extend `AppError` (2.2) and are mapped centrally (2.4). Unknown errors return a generic 500 with a `requestId`, and the detail goes to the log (6.20). Express client errors such as 413 keep their status.
- Crashes: `unhandledRejection` and `uncaughtException` log at fatal level and exit, so the process manager restarts a clean process (2.6, 2.10). SIGTERM closes Prisma and the server (8.6).
- Logging: pino JSON to stdout only (5.18). Every request gets an `x-request-id`, which appears on every log line (5.14). Cookies, CSRF tokens and passwords are redacted. Never use `console.log` in API code; lint warns.
- Every promise is awaited or explicitly `void`-ed; `no-floating-promises` enforces this (2.12).
- Validation: Zod at every boundary (2.11, 6.10); JSON bodies are capped at 256 kB (6.14).
- Config: environment-aware and validated at startup (1.4); `NODE_ENV=production` in images (5.15).
- Node 22 LTS, pinned in `.nvmrc` and `engines` (4.4, 5.17). CI installs with `npm ci` (5.19) and runs `npm audit` (5.13).
- Docker images are multi-stage, use a pinned base tag, run as `node` (non-root) and start with `node`, not `npm` (8.1, 8.2, 8.9, 6.13). Migrations run from the separate `migrate` target.
- Imports of built-in modules use the `node:` prefix (6.27).

## Rules that do not transfer

| Rule | Why not here |
|---|---|
| `controller-invokable-single-action` | Multi-route controllers per resource are idiomatic Nest |
| `route-model-binding-*`, `route-cacheable-controller-routes` | No Nest equivalent; ids are parsed with `ParseUUIDPipe` and looked up with `businessId` |
| `error-sensitive-parameter-attribute` | No PHP attribute in JS; instead never log request bodies, passwords or tokens |
| `model-*` (fillable, observers, `#[Scope]`) | Prisma has no active-record models; repositories select explicit columns |
| `repo-interface-in-domain-contracts`, `repo-bind-in-service-provider` | One implementation per repository, so no interface yet [gate-earn-extension-seam] |
| `laravel-async` (jobs, events, cache, scheduling) | No queue or cache yet. Adopt it as written when BullMQ/Redis arrive in V2 (background imports, alerts): idempotent handlers, dispatch after commit, ids not objects in payloads |

## Known gaps

- No safety net that rejects a Prisma query on a tenant table without `businessId` (SRS 3.5); isolation relies on repositories plus the cross-tenant tests.
- Login failure limits are in memory: move `LoginAttempts` to Redis before running more than one API instance.
- No error tracking or APM yet (nbp 2.9, 5.8); add Sentry before launch.
- No Content-Security-Policy on the web app: a correct one needs per-request nonces for Next's inline scripts.
- The API image is about 730 MB; a smaller base or pruning Prisma engines would help (nbp 8.10).
- The CI workflow has not run on GitHub yet; check its first run.
- A search index rebuild drops and refills the collection; searches fall back to Postgres meanwhile. Use a Typesense alias swap for zero-downtime rebuilds once catalogues are large.
- A price change always applies from today; there is no way yet to enter a price that changed on a past date.

## Working agreements

- Never commit; the user commits.
- Never run destructive git commands (`reset --hard`, `checkout --`, `stash`) on uncommitted work.
