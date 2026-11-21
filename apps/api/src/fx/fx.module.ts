import { Global, Module } from '@nestjs/common';
import { PlatformAdminGuard } from '../admin/platform-admin.guard';
import { FxController } from './fx.controller';
import { FxService } from './fx.service';

@Global()
@Module({
  controllers: [FxController],
  providers: [FxService, PlatformAdminGuard],
  exports: [FxService],
})
export class FxModule {}
