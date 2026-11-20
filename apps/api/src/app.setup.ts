import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';

/** Configuration commune à l'application réelle et aux tests. */
export function setupApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.enableShutdownHooks();
  return app;
}
