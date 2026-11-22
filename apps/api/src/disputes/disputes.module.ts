import { Module } from '@nestjs/common';
import { PlatformAdminGuard } from '../admin/platform-admin.guard';
import { AdminDisputesController, DisputesController } from './disputes.controller';
import { DisputesService } from './disputes.service';

@Module({
  controllers: [DisputesController, AdminDisputesController],
  providers: [DisputesService, PlatformAdminGuard],
})
export class DisputesModule {}
