import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  AddParcelItemsSchema,
  CreateParcelSchema,
  MAX_UPLOAD_BYTES,
  RemoveParcelItemSchema,
  UpdateParcelSchema,
  type AddParcelItemsInput,
  type CreateParcelInput,
  type PackableItem,
  type ParcelDetail,
  type ParcelSummary,
  type UpdateParcelInput,
} from '@konzia/shared';
import type { Response } from 'express';
import type { AuthContext } from '../auth/auth.types';
import { Auth } from '../auth/decorators';
import { ZodBody } from '../common/zod-body.pipe';
import type { UploadedBlob } from '../files/files.service';
import { ForOrg, Org, type OrgContext } from '../tenancy/org-context';
import { ParcelsService } from './parcels.service';

@Controller('org')
export class ParcelsController {
  constructor(private readonly parcels: ParcelsService) {}

  @Get('packable-items')
  @ForOrg('parcel.manage')
  packable(@Auth() auth: AuthContext, @Org() org: OrgContext): Promise<PackableItem[]> {
    return this.parcels.packable(auth.userId, org);
  }

  @Get('parcels')
  @ForOrg('order.view')
  list(@Auth() auth: AuthContext, @Org() org: OrgContext): Promise<ParcelSummary[]> {
    return this.parcels.list(auth.userId, org);
  }

  @Post('parcels')
  @ForOrg('parcel.manage')
  create(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Body(new ZodBody(CreateParcelSchema)) body: CreateParcelInput,
  ): Promise<ParcelDetail> {
    return this.parcels.create(auth.userId, org, body);
  }

  @Get('parcels/:id')
  @ForOrg('order.view')
  get(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ParcelDetail> {
    return this.parcels.get(auth.userId, org, id);
  }

  @Patch('parcels/:id')
  @ForOrg('parcel.manage')
  update(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(UpdateParcelSchema)) body: UpdateParcelInput,
  ): Promise<ParcelDetail> {
    return this.parcels.update(auth.userId, org, id, body);
  }

  @Post('parcels/:id/items')
  @ForOrg('parcel.manage')
  addItems(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(AddParcelItemsSchema)) body: AddParcelItemsInput,
  ): Promise<ParcelDetail> {
    return this.parcels.addItems(auth.userId, org, id, body);
  }

  @Post('parcels/:id/items/:itemId/remove')
  @ForOrg('parcel.manage')
  removeItem(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body(new ZodBody(RemoveParcelItemSchema)) body: { reason: string },
  ): Promise<ParcelDetail> {
    return this.parcels.removeItem(auth.userId, org, id, itemId, body.reason);
  }

  @Post('parcels/:id/close')
  @ForOrg('parcel.manage')
  close(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ParcelDetail> {
    return this.parcels.setStatus(auth.userId, org, id, 'closed');
  }

  @Post('parcels/:id/reopen')
  @ForOrg('parcel.manage')
  reopen(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ParcelDetail> {
    return this.parcels.setStatus(auth.userId, org, id, 'open');
  }

  @Post('parcels/:id/cancel')
  @ForOrg('parcel.manage')
  cancel(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ParcelDetail> {
    return this.parcels.setStatus(auth.userId, org, id, 'cancelled');
  }

  @Post('parcels/:id/photos')
  @ForOrg('parcel.manage')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES + 1, files: 1 } }),
  )
  addPhoto(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedBlob | undefined,
  ): Promise<ParcelDetail> {
    if (!file) throw new BadRequestException('Choisissez une photo.');
    return this.parcels.addPhoto(auth.userId, org, id, file);
  }

  @Get('parcels/:id/photos/:fileId')
  @ForOrg('order.view')
  async photo(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.parcels.photo(auth.userId, org, id, fileId);
    res.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(file.content, {
      type: file.mime,
      disposition: `inline; filename="${encodeURIComponent(file.originalName)}"`,
    });
  }
}
