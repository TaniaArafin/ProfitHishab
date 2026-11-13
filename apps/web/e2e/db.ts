// The billing e2e needs the built API (`npm run build -w @ph/api`, for dist/admin-grant.js) and a DATABASE_URL
// (env or apps/api/.env) that `prisma db execute` reads: the database the running API uses.
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const API_DIR = path.resolve(__dirname, '../../api');

/** Only an address the test generated itself ever reaches SQL; refuse anything else. */
function safeEmail(email: string): string {
  if (!/^[a-z0-9@.-]+$/.test(email)) throw new Error(`Unsafe email for SQL: ${email}`);
  return email;
}

/** Runs SQL through Prisma (dev database from apps/api/.env), so the web workspace needs no `pg`. */
function runSql(sql: string): void {
  execFileSync('npx', ['prisma', 'db', 'execute', '--stdin', '--schema', 'prisma/schema.prisma'], {
    cwd: API_DIR,
    input: sql,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

/** Puts the seller's free trial one minute in the past. */
export function endTrial(email: string): void {
  runSql(
    `UPDATE businesses SET "trialEndsAt" = now() - interval '1 minute' WHERE "ownerId" = (SELECT id FROM users WHERE email = '${safeEmail(email)}');`,
  );
}

/** Makes an existing account a platform admin (needs the API built: `dist/admin-grant.js`). */
export function grantAdmin(email: string): void {
  execFileSync('node', ['dist/admin-grant.js', safeEmail(email)], { cwd: API_DIR, stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Gives the seller's business one customer and a `new` order for each external ref (so an import sees them as duplicates). */
export function seedImportedOrders(email: string, refs: string[]): void {
  const owner = `(SELECT id FROM users WHERE email = '${safeEmail(email)}')`;
  const business = `(SELECT id FROM businesses WHERE "ownerId" = ${owner})`;
  const values = refs
    .map((ref, i) => {
      if (!/^[A-Z0-9-]+$/.test(ref)) throw new Error(`Unsafe ref for SQL: ${ref}`);
      return `(gen_random_uuid(), ${business}, ${9000 + i}, (SELECT id FROM customers WHERE "businessId" = ${business} AND phone = '01900000000'), 'new', 'cod', DATE '2026-09-01', 0, 0, '${ref}', now(), now())`;
    })
    .join(',');
  runSql(`
    INSERT INTO customers (id, "businessId", name, phone, "updatedAt")
    VALUES (gen_random_uuid(), ${business}, 'Seeded Customer', '01900000000', now());
    INSERT INTO orders (id, "businessId", "orderNo", "customerId", status, "paymentMethod", "orderDate", subtotal, total, "externalRef", "createdAt", "updatedAt")
    VALUES ${values};
  `);
}
