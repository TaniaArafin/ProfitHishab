import 'reflect-metadata';
import { existsSync } from 'node:fs';

// Load apps/api/.env before any module reads configuration (Node 22 built-in, no dotenv needed).
// The app is imported dynamically below so this runs first.
if (existsSync('.env')) process.loadEnvFile('.env');

async function bootstrap(): Promise<void> {
  const { config } = await import('./config');
  const { port } = config(); // validates the environment before anything connects
  const { createApp } = await import('./app.factory');
  const { Logger } = await import('nestjs-pino');

  const app = await createApp();
  const logger = app.get(Logger);

  // An unexpected error leaves the process in an unknown state: log it and exit so the
  // process manager restarts a clean one (nodebestpractices 2.6, 2.10, 6.23).
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'Unhandled promise rejection, exiting');
    process.exit(1);
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception, exiting');
    process.exit(1);
  });

  app.enableShutdownHooks(); // closes Prisma and the HTTP server on SIGTERM (8.6)
  await app.listen(port);
  logger.log(`ProfitHishab API listening on http://localhost:${port}/v1`);
}

void bootstrap();
