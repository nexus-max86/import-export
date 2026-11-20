import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from '@konzia/shared';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { EMAIL_SENDER } from '../src/email/email-sender';
import { FakeEmailSender } from '../src/email/fake-email-sender';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS } from '../src/redis/redis.module';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  outbox: FakeEmailSender;
  /** Agent HTTP qui conserve les cookies et ajoute l'en-tête CSRF aux écritures. */
  agent(): TestAgent;
  reset(): Promise<void>;
}

export type TestAgent = ReturnType<typeof makeAgent>;

function makeAgent(app: INestApplication) {
  const a = request.agent(app.getHttpServer());
  return {
    get: (url: string) => a.get(url),
    post: (url: string, body?: object) =>
      a.post(url).set(CSRF_HEADER, CSRF_HEADER_VALUE).send(body),
    delete: (url: string) => a.delete(url).set(CSRF_HEADER, CSRF_HEADER_VALUE),
  };
}

/** Démarre l'application complète contre la base de test réelle. */
export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = setupApp(moduleRef.createNestApplication({ logger: false }));
  await app.init();
  const prisma = app.get(PrismaService);
  const redis = app.get<Redis>(REDIS);
  const outbox = app.get<FakeEmailSender>(EMAIL_SENDER);
  return {
    app,
    prisma,
    outbox,
    agent: () => makeAgent(app),
    async reset() {
      await prisma.$executeRawUnsafe('TRUNCATE users CASCADE');
      if (redis.status === 'wait') await redis.connect();
      await redis.flushdb();
      outbox.outbox.length = 0;
    },
  };
}

/** Extrait le jeton d'un lien reçu par e-mail. */
export function tokenFrom(text: string | undefined): string {
  const match = text?.match(/jeton=([A-Za-z0-9_-]+)/);
  if (!match?.[1]) throw new Error('Aucun jeton trouvé dans l’e-mail.');
  return match[1];
}
