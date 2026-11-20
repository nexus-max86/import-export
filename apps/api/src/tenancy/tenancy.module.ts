import { Global, Module } from '@nestjs/common';
import { OrgGuard } from './org-context';
import { TenantDb } from './tenant-db.service';

@Global()
@Module({ providers: [TenantDb, OrgGuard], exports: [TenantDb, OrgGuard] })
export class TenancyModule {}
