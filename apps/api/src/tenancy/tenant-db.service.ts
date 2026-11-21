import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@konzia/db';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';

export type TenantTx = Prisma.TransactionClient;

/**
 * Accès aux données métier par le rôle konzia_app, soumis à la Row-Level Security (D1).
 * Chaque unité de travail s'exécute dans une transaction où `app.user_id` est fixé :
 * PostgreSQL ne laisse voir que les lignes autorisées pour cet utilisateur.
 */
@Injectable()
export class TenantDb implements OnModuleDestroy {
  private readonly client: PrismaClient;

  constructor(@Inject(ENV) env: Env) {
    this.client = new PrismaClient({ datasourceUrl: env.APP_DATABASE_URL });
  }

  run<T>(userId: string, work: (tx: TenantTx) => Promise<T>): Promise<T> {
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
      return work(tx);
    });
  }

  /**
   * Lecture publique (visiteur non connecté) : même rôle konzia_app, sans utilisateur.
   * La RLS ne laisse alors voir que ce qui est public (organisations approuvées…).
   */
  runAnonymous<T>(work: (tx: TenantTx) => Promise<T>): Promise<T> {
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.user_id', '', true)`;
      return work(tx);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
