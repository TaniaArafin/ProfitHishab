// Tests always run against the separate test database created by docker/init-test-db.sql.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://profithishab:profithishab@localhost:5434/profithishab_test?schema=public';
process.env.COOKIE_SECURE = 'false';
process.env.RATE_LIMIT_PER_MINUTE = '10000';
process.env.REGISTER_LIMIT_PER_15_MINUTES = '1000';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
// Product search: Postgres by default; set TEST_TYPESENSE_URL to run against Typesense (own collection).
// Set explicitly: Prisma loads apps/api/.env into process.env, which would otherwise switch Typesense on.
process.env.SEARCH_DRIVER = process.env.TEST_TYPESENSE_URL ? 'typesense' : 'postgres';
if (process.env.TEST_TYPESENSE_URL) {
  process.env.TYPESENSE_URL = process.env.TEST_TYPESENSE_URL;
  process.env.TYPESENSE_API_KEY = process.env.TEST_TYPESENSE_API_KEY ?? 'profithishab-dev-key';
  process.env.TYPESENSE_COLLECTION = 'products_test';
}
