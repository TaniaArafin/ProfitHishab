import 'reflect-metadata';
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');

/**
 * `npm run admin:grant -- <email or phone>` makes that user a platform admin (/admin in the web app);
 * add `--revoke` to remove it. The only way to become an admin: the API never grants it.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const revoke = args.includes('--revoke');
  const identifier = args.find((a) => !a.startsWith('--'));
  if (!identifier) {
    process.stderr.write('Usage: npm run admin:grant -w @ph/api -- <email or phone> [--revoke]\n');
    process.exit(2);
  }
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('./app.module');
  const { AdminService } = await import('./modules/admin/admin.service');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const user = await app.get(AdminService).grant(identifier, !revoke);
    if (!user) {
      process.stderr.write(`No user with the email or phone "${identifier}".\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(
      revoke
        ? `${user.name} is no longer a platform admin.\n`
        : `${user.name} is now a platform admin. Their own business has unlimited access.\n`,
    );
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
