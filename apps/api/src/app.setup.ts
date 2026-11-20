import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { loadEnv } from './config/env';

/** Configuration commune à l'application réelle et aux tests. */
export function setupApp<T extends INestApplication>(app: T): T {
  const env = loadEnv();
  const express = app as unknown as NestExpressApplication;
  // Derrière Caddy : l'IP du client vient de X-Forwarded-For, seulement pour les proxys déclarés.
  express.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.enableShutdownHooks();
  return app;
}
