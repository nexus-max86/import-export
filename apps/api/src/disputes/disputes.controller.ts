import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  AdminListQuerySchema,
  DisputeMessageSchema,
  MAX_UPLOAD_BYTES,
  OpenDisputeSchema,
  ReopenDisputeSchema,
  ResolveDisputeSchema,
  type AdminListQuery,
  type AdminPage,
  type DisputeInfo,
  type DisputeMessageInput,
  type OpenDisputeInput,
} from '@konzia/shared';
import type { Response } from 'express';
import { PlatformAdmin } from '../admin/platform-admin.guard';
import type { AuthContext } from '../auth/auth.types';
import { Auth } from '../auth/decorators';
import { ZodBody } from '../common/zod-body.pipe';
import type { UploadedBlob } from '../files/files.service';
import { ForOrg, Org, type OrgContext } from '../tenancy/org-context';
import { DisputesService } from './disputes.service';

function stream(res: Response, f: { content: Buffer; mime: string; originalName: string }) {
  res.setHeader('Cache-Control', 'private, no-store');
  return new StreamableFile(f.content, {
    type: f.mime,
    disposition: `inline; filename="${encodeURIComponent(f.originalName)}"`,
  });
}

@Controller()
export class DisputesController {
  constructor(private readonly disputes: DisputesService) {}

  // --- Client ---
  @Post('dispute-evidence')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES + 1, files: 1 } }),
  )
  upload(@Auth() auth: AuthContext, @UploadedFile() file: UploadedBlob | undefined) {
    if (!file) throw new BadRequestException('Choisissez une photo ou un PDF.');
    return this.disputes.uploadEvidence(auth.userId, file);
  }

  @Post('orders/:id/disputes')
  open(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(OpenDisputeSchema)) body: OpenDisputeInput,
  ): Promise<DisputeInfo> {
    return this.disputes.open(auth.userId, id, body);
  }

  @Get('disputes')
  mine(@Auth() auth: AuthContext): Promise<DisputeInfo[]> {
    return this.disputes.listForCustomer(auth.userId);
  }

  @Get('disputes/:id')
  get(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string): Promise<DisputeInfo> {
    return this.disputes.get(auth.userId, id, { as: 'customer' });
  }

  @Post('disputes/:id/messages')
  message(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(DisputeMessageSchema)) body: DisputeMessageInput,
  ): Promise<DisputeInfo> {
    return this.disputes.addMessage(auth.userId, id, body, { as: 'customer' });
  }

  @Get('disputes/:id/files/:fileId')
  async file(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return stream(res, await this.disputes.file(auth.userId, id, fileId, { as: 'customer' }));
  }

  // --- Commissionnaire ---
  @Get('org/disputes')
  @ForOrg('dispute.respond')
  orgList(@Auth() auth: AuthContext, @Org() org: OrgContext): Promise<DisputeInfo[]> {
    return this.disputes.listForOrg(auth.userId, org);
  }

  @Get('org/disputes/:id')
  @ForOrg('dispute.respond')
  orgGet(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DisputeInfo> {
    return this.disputes.get(auth.userId, id, { as: 'commissioner', org });
  }

  @Post('org/disputes/:id/messages')
  @ForOrg('dispute.respond')
  orgMessage(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(DisputeMessageSchema)) body: DisputeMessageInput,
  ): Promise<DisputeInfo> {
    return this.disputes.addMessage(auth.userId, id, body, { as: 'commissioner', org });
  }

  @Get('org/disputes/:id/files/:fileId')
  @ForOrg('dispute.respond')
  async orgFile(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return stream(
      res,
      await this.disputes.file(auth.userId, id, fileId, { as: 'commissioner', org }),
    );
  }
}

/** Support Konzia : décision, clôture, réouverture (MFA exigée). */
@Controller('admin/disputes')
@PlatformAdmin()
export class AdminDisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Get()
  list(
    @Auth() auth: AuthContext,
    @Query(new ZodBody(AdminListQuerySchema)) q: AdminListQuery,
  ): Promise<AdminPage<DisputeInfo>> {
    return this.disputes.adminList(auth.userId, q);
  }

  @Get(':id')
  get(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string): Promise<DisputeInfo> {
    return this.disputes.adminGet(auth.userId, id);
  }

  @Post(':id/messages')
  message(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(DisputeMessageSchema)) body: DisputeMessageInput,
  ): Promise<DisputeInfo> {
    return this.disputes.addMessage(auth.userId, id, body, { as: 'support' });
  }

  @Post(':id/resolve')
  resolve(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(ResolveDisputeSchema)) body: { resolution: string },
  ): Promise<DisputeInfo> {
    return this.disputes.resolve(auth.userId, id, body.resolution);
  }

  @Post(':id/close')
  close(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string): Promise<DisputeInfo> {
    return this.disputes.close(auth.userId, id);
  }

  @Post(':id/reopen')
  reopen(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(ReopenDisputeSchema)) body: { reason: string },
  ): Promise<DisputeInfo> {
    return this.disputes.reopen(auth.userId, id, body.reason);
  }

  @Get(':id/files/:fileId')
  async file(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return stream(res, await this.disputes.file(auth.userId, id, fileId, { as: 'support' }));
  }
}
