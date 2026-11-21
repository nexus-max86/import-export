import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  MAX_UPLOAD_BYTES,
  ReceiveSchema,
  SupplierOrderSchema,
  UpdateSupplierOrderSchema,
  type PurchasableItem,
  type ReceiveInput,
  type SupplierOrderInfo,
  type SupplierOrderInput,
} from '@konzia/shared';
import type { Response } from 'express';
import type { AuthContext } from '../auth/auth.types';
import { Auth } from '../auth/decorators';
import { ZodBody } from '../common/zod-body.pipe';
import type { UploadedBlob } from '../files/files.service';
import { ForOrg, Org, type OrgContext } from '../tenancy/org-context';
import { SupplierOrdersService } from './supplier-orders.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('org')
export class SupplierOrdersController {
  constructor(private readonly purchases: SupplierOrdersService) {}

  @Get('purchasable-items')
  @ForOrg('supplier_order.manage')
  purchasable(@Auth() auth: AuthContext, @Org() org: OrgContext): Promise<PurchasableItem[]> {
    return this.purchases.purchasable(auth.userId, org);
  }

  @Post('purchase-proofs')
  @ForOrg('supplier_order.manage')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES + 1, files: 1 } }),
  )
  uploadProof(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @UploadedFile() file: UploadedBlob | undefined,
  ): Promise<{ fileId: string }> {
    if (!file) throw new BadRequestException('Choisissez une photo ou un PDF.');
    return this.purchases.storeProof(auth.userId, org, file);
  }

  @Get('supplier-orders')
  @ForOrg('supplier_order.view')
  list(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Query('commande') orderId?: string,
  ): Promise<SupplierOrderInfo[]> {
    if (orderId && !UUID.test(orderId)) throw new BadRequestException('Commande invalide.');
    return this.purchases.list(auth.userId, org, orderId);
  }

  @Post('supplier-orders')
  @ForOrg('supplier_order.manage')
  create(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Body(new ZodBody(SupplierOrderSchema)) body: SupplierOrderInput,
  ): Promise<SupplierOrderInfo> {
    return this.purchases.create(auth.userId, org, body);
  }

  @Get('supplier-orders/:id')
  @ForOrg('supplier_order.view')
  get(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SupplierOrderInfo> {
    return this.purchases.get(auth.userId, org, id);
  }

  @Patch('supplier-orders/:id')
  @ForOrg('supplier_order.manage')
  update(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(UpdateSupplierOrderSchema))
    body: {
      sellerTrackingNumber?: string | null;
      status?: 'shipped_by_seller';
      note?: string | null;
    },
  ): Promise<SupplierOrderInfo> {
    return this.purchases.update(auth.userId, org, id, body);
  }

  @Post('supplier-orders/:id/receive')
  @ForOrg('supplier_order.manage')
  receive(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(ReceiveSchema)) body: ReceiveInput,
  ): Promise<SupplierOrderInfo> {
    return this.purchases.receive(auth.userId, org, id, body);
  }

  @Get('supplier-orders/:id/proof')
  @ForOrg('supplier_order.view')
  async proof(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.purchases.proof(auth.userId, org, id);
    res.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(file.content, {
      type: file.mime,
      disposition: `inline; filename="${encodeURIComponent(file.originalName)}"`,
    });
  }
}
