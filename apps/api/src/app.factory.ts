import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

/** JSON bodies above this are refused before parsing (nodebestpractices 6.14). Imports will use multipart. */
const JSON_BODY_LIMIT = '256kb';

/**
 * Shared by main.ts and the e2e tests so both run the exact same pipeline.
 * The app must be created with `bodyParser: false` so the limit below is the only parser.
 */
export function configureApp(app: NestExpressApplication): NestExpressApplication {
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('v1', { exclude: ['health'] });
  app.use(helmet());
  app.use(cookieParser());
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  return app;
}

export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true, bodyParser: false });
  // The web server proxies every request, so trust its X-Forwarded-For for rate limiting.
  app.set('trust proxy', 'loopback');
  return configureApp(app);
}
