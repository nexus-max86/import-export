import { Body, Controller, Get, Post } from '@nestjs/common';
import { CreateRateSchema, type CreateRateInput, type RateInfo } from '@konzia/shared';
import { PlatformAdmin } from '../admin/platform-admin.guard';
import type { AuthContext } from '../auth/auth.types';
import { Auth } from '../auth/decorators';
import { ZodBody } from '../common/zod-body.pipe';
import { FxService } from './fx.service';

@Controller()
export class FxController {
  constructor(private readonly fx: FxService) {}

  @Get('exchange-rates/current')
  current(): Promise<RateInfo[]> {
    return this.fx.currentAll();
  }

  @Get('admin/exchange-rates')
  @PlatformAdmin()
  history(): Promise<RateInfo[]> {
    return this.fx.history();
  }

  @Post('admin/exchange-rates')
  @PlatformAdmin()
  publish(
    @Auth() auth: AuthContext,
    @Body(new ZodBody(CreateRateSchema)) body: CreateRateInput,
  ): Promise<RateInfo> {
    return this.fx.publish(auth.userId, body);
  }
}
