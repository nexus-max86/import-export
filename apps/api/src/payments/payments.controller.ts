import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  DeclarePaymentSchema,
  MAX_UPLOAD_BYTES,
  PaymentInstructionsSchema,
  RecordPaymentSchema,
  RefundSchema,
  RejectPaymentSchema,
  type CustomerBalance,
  type DeclarePaymentInput,
  type PaymentInfo,
  type PaymentInstruction,
  type RecordPaymentInput,
  type RefundInput,
} from '@konzia/shared';
import type { Response } from 'express';
import type { AuthContext } from '../auth/auth.types';
import { Auth } from '../auth/decorators';
import { ZodBody } from '../common/zod-body.pipe';
import { FilesService, type UploadedBlob } from '../files/files.service';
import { ForOrg, Org, type OrgContext } from '../tenancy/org-context';
import { TenantDb } from '../tenancy/tenant-db.service';
import { PaymentsService } from './payments.service';

@Controller()
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly files: FilesService,
    private readonly db: TenantDb,
  ) {}

  // --- Client ---
  @Get('orders/:id/payment-instructions')
  instructionsForOrder(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.payments.instructionsForOrder(auth.userId, id);
  }

  @Get('orders/:id/payments')
  listForOrder(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PaymentInfo[]> {
    return this.payments.listForCustomerOrder(auth.userId, id);
  }

  @Post('orders/:id/payments')
  declare(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(DeclarePaymentSchema)) body: DeclarePaymentInput,
  ): Promise<PaymentInfo> {
    return this.payments.declare(auth.userId, id, body);
  }

  @Post('payments/:id/cancel')
  cancel(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string): Promise<PaymentInfo> {
    return this.payments.cancelDeclaration(auth.userId, id);
  }

  @Post('payments/proofs')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES + 1, files: 1 } }),
  )
  async uploadProof(
    @Auth() auth: AuthContext,
    @UploadedFile() file: UploadedBlob | undefined,
  ): Promise<{ fileId: string }> {
    if (!file) throw new BadRequestException('Choisissez une photo ou un PDF.');
    const stored = await this.db.run(auth.userId, (tx) =>
      this.files.store(tx, auth.userId, null, 'payment_proof', file),
    );
    return { fileId: stored.id };
  }

  // --- Commissionnaire ---
  @Get('org/payment-instructions')
  @ForOrg('payment.view')
  getInstructions(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
  ): Promise<PaymentInstruction[]> {
    return this.payments.getInstructions(auth.userId, org);
  }

  @Put('org/payment-instructions')
  @ForOrg('org.settings.edit')
  setInstructions(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Body(new ZodBody(PaymentInstructionsSchema)) body: { instructions: PaymentInstruction[] },
  ): Promise<PaymentInstruction[]> {
    return this.payments.setInstructions(auth.userId, org, body.instructions);
  }

  @Get('org/payments')
  @ForOrg('payment.view')
  listForOrg(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Query('commande') orderId?: string,
    @Query('statut') statut?: string,
  ): Promise<PaymentInfo[]> {
    if (orderId && !/^[0-9a-f-]{36}$/i.test(orderId))
      throw new BadRequestException('Commande invalide.');
    return this.payments.listForOrg(auth.userId, org, {
      orderId,
      pending: statut === 'a-verifier',
    });
  }

  @Get('org/balances')
  @ForOrg('payment.view')
  balances(@Auth() auth: AuthContext, @Org() org: OrgContext): Promise<CustomerBalance[]> {
    return this.payments.balances(auth.userId, org);
  }

  @Post('org/payments/:id/confirm')
  @ForOrg('payment.confirm')
  confirm(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PaymentInfo> {
    return this.payments.confirm(auth.userId, org, id);
  }

  @Post('org/payments/:id/reject')
  @ForOrg('payment.reject')
  reject(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(RejectPaymentSchema)) body: { reason: string },
  ): Promise<PaymentInfo> {
    return this.payments.reject(auth.userId, org, id, body.reason);
  }

  @Get('org/payments/:id/proof')
  @ForOrg('payment.view')
  async proof(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.payments.proof(auth.userId, org, id);
    res.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(file.content, {
      type: file.mime,
      disposition: `inline; filename="${encodeURIComponent(file.originalName)}"`,
    });
  }

  @Post('org/orders/:id/payments')
  @ForOrg('payment.record_offline')
  record(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(RecordPaymentSchema)) body: RecordPaymentInput,
  ): Promise<PaymentInfo> {
    return this.payments.recordOffline(auth.userId, org, id, body);
  }

  @Post('org/orders/:id/refunds')
  @ForOrg('payment.refund')
  refund(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(RefundSchema)) body: RefundInput,
  ): Promise<PaymentInfo> {
    return this.payments.refund(auth.userId, org, id, body);
  }
}
