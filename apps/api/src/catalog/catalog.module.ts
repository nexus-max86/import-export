import { Module } from '@nestjs/common';
import { RateLimitService } from '../common/rate-limit.service';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { CatalogController } from './catalog.controller';
import { FakeProductFetcher, HttpProductFetcher, PRODUCT_FETCHER } from './product-fetcher';

@Module({
  controllers: [CatalogController],
  providers: [
    RateLimitService,
    {
      provide: PRODUCT_FETCHER,
      inject: [ENV],
      useFactory: (env: Env) =>
        env.PRODUCT_FETCHER === 'fake' ? new FakeProductFetcher() : new HttpProductFetcher(),
    },
  ],
})
export class CatalogModule {}
