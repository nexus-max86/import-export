import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CsrfMiddleware } from './common/csrf.middleware';
import { CatalogModule } from './catalog/catalog.module';
import { ConfigModule } from './config/config.module';
import { loadEnv } from './config/env';
import { CustomersModule } from './customers/customers.module';
import { DirectoryModule } from './directory/directory.module';
import { DevModule } from './dev/dev.module';
import { EmailModule } from './email/email.module';
import { FilesModule } from './files/files.module';
import { GeoModule } from './geo/geo.module';
import { HealthController } from './health/health.controller';
import { OrganizationsModule } from './organizations/organizations.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProfileModule } from './profile/profile.module';
import { RedisModule } from './redis/redis.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { VerificationModule } from './verification/verification.module';

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
    EmailModule,
    TenancyModule,
    AuditModule,
    AuthModule,
    OrganizationsModule,
    GeoModule,
    ProfileModule,
    CustomersModule,
    FilesModule,
    VerificationModule,
    DirectoryModule,
    CatalogModule,
    ...(env.NODE_ENV !== 'production' && env.EMAIL_TRANSPORT === 'fake' ? [DevModule] : []),
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CsrfMiddleware).forRoutes('*path');
  }
}
