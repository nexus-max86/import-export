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

const SEED_CITIES = "'Lubumbashi', 'Likasi', 'Kasumbalesa', 'Kipushi'";
const SEED_ZONES = "'Lubumbashi', 'Kamalondo', 'Kenya', 'Katuba', 'Kampemba', 'Annexe', 'Rwashi'";

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
    put: (url: string, body?: object) => a.put(url).set(CSRF_HEADER, CSRF_HEADER_VALUE).send(body),
    patch: (url: string, body?: object) =>
      a.patch(url).set(CSRF_HEADER, CSRF_HEADER_VALUE).send(body),
    delete: (url: string) => a.delete(url).set(CSRF_HEADER, CSRF_HEADER_VALUE),
    /** Envoi multipart d'un fichier (champ « file ») avec des champs texte. */
    postFile: (url: string, fields: Record<string, string>, content: Buffer, filename: string) => {
      let req = a.post(url).set(CSRF_HEADER, CSRF_HEADER_VALUE);
      for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
      return req.attach('file', content, filename);
    },
  };
}

/** Démarre l'application complète contre la base de test réelle. */
export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = setupApp(
    moduleRef.createNestApplication({ logger: process.env.TEST_NEST_LOGS ? ['error'] : false }),
  );
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
      await prisma.$executeRawUnsafe(
        'TRUNCATE users, organizations, audit_logs, quote_requests, exchange_rates, orders, supplier_orders, parcels, shipments CASCADE',
      );
      // Référentiel : on ne garde que les données de la migration (villes du pilote, communes de Lubumbashi).
      await prisma.$executeRawUnsafe(
        `DELETE FROM service_zones WHERE city_id IN (SELECT id FROM cities WHERE name NOT IN (${SEED_CITIES}))
           OR (city_id = (SELECT id FROM cities WHERE name = 'Lubumbashi') AND name NOT IN (${SEED_ZONES}))`,
      );
      await prisma.$executeRawUnsafe(`DELETE FROM cities WHERE name NOT IN (${SEED_CITIES})`);
      await prisma.$executeRawUnsafe(`UPDATE cities SET is_active = (name = 'Lubumbashi')`);
      await prisma.$executeRawUnsafe(`UPDATE service_zones SET is_active = true`);
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
