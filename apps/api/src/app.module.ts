import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule } from './config/config.module';
import { loadEnv } from './config/env';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';

const env = loadEnv();

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: env.LOG_LEVEL,
        // Aucune donnée personnelle ni secret dans les logs (ENF-08).
        redact: [
          'req.headers.cookie',
          'req.headers.authorization',
          'req.remoteAddress',
          'req.remotePort',
          'res.headers["set-cookie"]',
        ],
        transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
      },
    }),
    PrismaModule,
    RedisModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
