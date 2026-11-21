import { Module } from '@nestjs/common';
import { RateLimitService } from '../common/rate-limit.service';
import { CatalogController } from './catalog.controller';

@Module({ controllers: [CatalogController], providers: [RateLimitService] })
export class CatalogModule {}
