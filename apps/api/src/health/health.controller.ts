import { Controller, Get, HttpCode, Inject, ServiceUnavailableException } from '@nestjs/common';
import type Redis from 'ioredis';
import { Public } from '../auth/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS } from '../redis/redis.module';

type Check = 'ok' | 'down';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Sonde de disponibilité : 200 si la base et Redis répondent, 503 sinon. */
  @Public()
  @Get()
  @HttpCode(200)
  async check(): Promise<{ status: 'ok'; db: Check; redis: Check }> {
    const [db, redis] = await Promise.all([this.checkDb(), this.checkRedis()]);
    if (db === 'down' || redis === 'down') {
      throw new ServiceUnavailableException({ status: 'degraded', db, redis });
    }
    return { status: 'ok', db, redis };
  }

  private async checkDb(): Promise<Check> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'ok';
    } catch {
      return 'down';
    }
  }

  private async checkRedis(): Promise<Check> {
    try {
      if (this.redis.status === 'wait') await this.redis.connect();
      return (await this.redis.ping()) === 'PONG' ? 'ok' : 'down';
    } catch {
      return 'down';
    }
  }
}
