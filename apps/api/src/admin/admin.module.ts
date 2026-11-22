import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminDecisionsService } from './admin-decisions.service';
import { AdminService } from './admin.service';
import { PlatformAdminGuard } from './platform-admin.guard';

@Module({
  controllers: [AdminController],
  providers: [AdminService, AdminDecisionsService, PlatformAdminGuard],
  exports: [AdminService],
})
export class AdminModule {}
