import 'reflect-metadata';
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');

/** `npm run search:rebuild`: rebuilds the product search index from Postgres (after a restore, or a Typesense wipe). */
async function main(): Promise<void> {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('./app.module');
  const { ProductSearch } = await import('./modules/products/product-search');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const count = await app.get(ProductSearch).rebuild();
    process.stdout.write(`Indexed ${count} products.\n`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
