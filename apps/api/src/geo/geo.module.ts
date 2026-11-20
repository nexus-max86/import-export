import { Module } from '@nestjs/common';
import { PlatformAdminGuard } from '../admin/platform-admin.guard';
import { GeoController } from './geo.controller';
import { GeoService } from './geo.service';

@Module({ controllers: [GeoController], providers: [GeoService, PlatformAdminGuard] })
export class GeoModule {}
