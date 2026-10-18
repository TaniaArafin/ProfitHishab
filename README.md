# ProfitHishab

Profit intelligence for Facebook sellers in Bangladesh. Requirements are in [SRS.md](SRS.md); engineering rules are in [CLAUDE.md](CLAUDE.md).

| Part | Path | Stack |
|---|---|---|
| Web | `apps/web` | Next.js 15 (App Router, server-rendered), React 19, Tailwind |
| API | `apps/api` | NestJS 11, Prisma 6, PostgreSQL 16 |
| Shared | `packages/shared` | Zod schemas, enums, money/phone/date helpers, response types |

## Run locally

Needs Node 22+ and Docker.

```bash
npm install
npm run db:up                         # Postgres on localhost:5434 (+ profithishab_test), Typesense on 127.0.0.1:8109
cp apps/api/.env.example apps/api/.env
npm run build:shared                  # rebuild after changing packages/shared
npm run migrate                       # apply Prisma migrations

npm run dev:api                       # http://localhost:4000/v1
npm run dev:web                       # http://localhost:3000
```

Open http://localhost:3000 and create an account. The browser only talks to the web app; `/api/*` is proxied to the API so the session cookie is first-party.

## Checks

```bash
npm run check                         # format check, lint, type-check, all unit/component/API tests
npm run format                        # fix formatting
npm run test:e2e                      # Playwright: register → product → order → profit (desktop + phone)
```

The API tests use the `profithishab_test` database. Apply migrations to it once:

```bash
cd apps/api && DATABASE_URL="postgresql://profithishab:profithishab@localhost:5434/profithishab_test?schema=public" npx prisma migrate deploy
```

CI (`.github/workflows/ci.yml`) runs all of the above on every push and pull request.

## Docker

```bash
docker build -f apps/api/Dockerfile -t profithishab-api .                       # API, runs as non-root
docker build -f apps/api/Dockerfile --target migrate -t profithishab-migrate .  # one-off: prisma migrate deploy
docker build -f apps/web/Dockerfile -t profithishab-web .                       # Next.js standalone server
```

## Conventions

- Money is integer poisha everywhere (`৳2,500` is `250000`). Convert only with `toPoisha` / `formatTaka` from `@ph/shared`.
- An order line stores the price and cost it was sold at, taken from the product's price history (`product_prices`) for the order date. Changing a product's price adds a history row from today; past orders never change.
- Product search (name, SKU) uses Typesense; Postgres is the source of truth and the fallback. `npm run search:rebuild -w @ph/api` rebuilds the index (after `npm run build -w @ph/api`). `SEARCH_DRIVER=postgres` runs without Typesense.
- Profit is never stored. It is derived from orders and expenses in `apps/api/src/modules/profit/` (pure functions in `profit.calculator.ts`, SQL aggregates in `profit.repository.ts`).
- API layering: controller (HTTP only) → service (rules) → repository (all Prisma calls).
- The business always comes from the session (`@Auth()`), never from the request.
- Every mutation needs the `x-csrf-token` header matching the `ph_csrf` cookie; `lib/client-api.ts` does this.
