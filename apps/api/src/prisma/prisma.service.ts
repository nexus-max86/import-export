import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@konzia/db';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    super({ datasourceUrl: env.DATABASE_URL });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
