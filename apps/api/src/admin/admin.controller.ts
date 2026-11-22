import { Controller, Get, Param, ParseUUIDPipe, Query, Res, StreamableFile } from '@nestjs/common';
import {
  AdminListQuerySchema,
  type AdminAuditRow,
  type AdminListQuery,
  type AdminOrderRow,
  type AdminOrganizationDetail,
  type AdminOrganizationRow,
  type AdminOverview,
  type AdminPage,
  type AdminParcelRow,
  type AdminPaymentRow,
  type AdminUserRow,
} from '@konzia/shared';
import type { Response } from 'express';
import type { AuthContext } from '../auth/auth.types';
import { Auth } from '../auth/decorators';
import { ZodBody } from '../common/zod-body.pipe';
import { AdminService } from './admin.service';
import { PlatformAdmin } from './platform-admin.guard';

const ListQuery = () => Query(new ZodBody(AdminListQuerySchema));

/** Console d'administration en lecture (ticket #26). */
@Controller('admin')
@PlatformAdmin()
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('overview')
  overview(@Auth() auth: AuthContext): Promise<AdminOverview> {
    return this.admin.overview(auth.userId);
  }

  @Get('users')
  users(
    @Auth() auth: AuthContext,
    @ListQuery() q: AdminListQuery,
  ): Promise<AdminPage<AdminUserRow>> {
    return this.admin.users(auth.userId, q);
  }

  @Get('organizations')
  organizations(
    @Auth() auth: AuthContext,
    @ListQuery() q: AdminListQuery,
  ): Promise<AdminPage<AdminOrganizationRow>> {
    return this.admin.organizations(auth.userId, q);
  }

  @Get('organizations/:id')
  organization(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminOrganizationDetail> {
    return this.admin.organization(auth.userId, id);
  }

  @Get('verification-documents/:id')
  async document(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.admin.verificationDocument(auth.userId, id);
    res.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(file.content, {
      type: file.mime,
      disposition: `inline; filename="${encodeURIComponent(file.originalName)}"`,
    });
  }

  @Get('orders')
  orders(
    @Auth() auth: AuthContext,
    @ListQuery() q: AdminListQuery,
  ): Promise<AdminPage<AdminOrderRow>> {
    return this.admin.orders(auth.userId, q);
  }

  @Get('payments')
  payments(
    @Auth() auth: AuthContext,
    @ListQuery() q: AdminListQuery,
  ): Promise<AdminPage<AdminPaymentRow>> {
    return this.admin.payments(auth.userId, q);
  }

  @Get('parcels')
  parcels(
    @Auth() auth: AuthContext,
    @ListQuery() q: AdminListQuery,
  ): Promise<AdminPage<AdminParcelRow>> {
    return this.admin.parcels(auth.userId, q);
  }

  @Get('audit')
  audit(
    @Auth() auth: AuthContext,
    @ListQuery() q: AdminListQuery,
  ): Promise<AdminPage<AdminAuditRow>> {
    return this.admin.auditLog(auth.userId, q);
  }
}
