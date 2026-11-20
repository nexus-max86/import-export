import { Module } from '@nestjs/common';
import { VerifiedEmailGuard } from '../auth/verified-email.guard';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  controllers: [OrganizationsController],
  providers: [OrganizationsService, VerifiedEmailGuard],
})
export class OrganizationsModule {}
