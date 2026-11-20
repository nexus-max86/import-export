import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  CreateCitySchema,
  CreateZoneSchema,
  OrgServiceZonesSchema,
  UpdateCitySchema,
  UpdateZoneSchema,
  type CityInfo,
  type OrgServiceZoneInfo,
  type OrgServiceZonesInput,
} from '@konzia/shared';
import { PlatformAdmin } from '../admin/platform-admin.guard';
import type { AuthContext } from '../auth/auth.types';
import { Auth, Public } from '../auth/decorators';
import { ZodBody } from '../common/zod-body.pipe';
import { ForOrg, Org, type OrgContext } from '../tenancy/org-context';
import { GeoService } from './geo.service';

@Controller()
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  @Public()
  @Get('cities')
  activeCities(): Promise<CityInfo[]> {
    return this.geo.activeCities();
  }

  @Get('admin/cities')
  @PlatformAdmin()
  allCities(): Promise<CityInfo[]> {
    return this.geo.allCities();
  }

  @Post('admin/cities')
  @PlatformAdmin()
  createCity(
    @Auth() auth: AuthContext,
    @Body(new ZodBody(CreateCitySchema)) body: { name: string },
  ): Promise<CityInfo> {
    return this.geo.createCity(auth.userId, body.name);
  }

  @Patch('admin/cities/:id')
  @PlatformAdmin()
  updateCity(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(UpdateCitySchema)) body: { name?: string; isActive?: boolean },
  ): Promise<CityInfo> {
    return this.geo.updateCity(auth.userId, id, body);
  }

  @Post('admin/cities/:id/zones')
  @HttpCode(204)
  @PlatformAdmin()
  createZone(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(CreateZoneSchema)) body: { name: string },
  ): Promise<void> {
    return this.geo.createZone(auth.userId, id, body.name);
  }

  @Patch('admin/zones/:id')
  @HttpCode(204)
  @PlatformAdmin()
  updateZone(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(UpdateZoneSchema)) body: { name?: string; isActive?: boolean },
  ): Promise<void> {
    return this.geo.updateZone(auth.userId, id, body);
  }

  @Get('org/service-zones')
  @ForOrg()
  orgZones(@Auth() auth: AuthContext, @Org() org: OrgContext): Promise<OrgServiceZoneInfo[]> {
    return this.geo.orgZones(auth.userId, org);
  }

  @Put('org/service-zones')
  @ForOrg('org.settings.edit')
  setOrgZones(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Body(new ZodBody(OrgServiceZonesSchema)) body: OrgServiceZonesInput,
  ): Promise<OrgServiceZoneInfo[]> {
    return this.geo.setOrgZones(auth.userId, org, body);
  }
}
