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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  OrgCustomerSchema,
  TokenSchema,
  MAX_IMPORT_BYTES,
  type ClaimLink,
  type ImportPreview,
  type ImportReport,
  type ClaimResult,
  type OrgCustomerInfo,
  type OrgCustomerInput,
} from '@konzia/shared';
import type { AuthContext } from '../auth/auth.types';
import { Auth } from '../auth/decorators';
import { RequireVerifiedEmail } from '../auth/verified-email.guard';
import { ZodBody } from '../common/zod-body.pipe';
import { ForOrg, Org, type OrgContext } from '../tenancy/org-context';
import { CustomerImportService } from './customer-import.service';
import { CustomersService } from './customers.service';
import type { UploadedBlob } from '../files/files.service';

const UUID = /^[0-9a-f-]{36}$/i;

@Controller()
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly imports: CustomerImportService,
  ) {}

  @Post('org/customers/import/preview')
  @ForOrg('customer.import')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES + 1, files: 1 } }),
  )
  previewImport(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @UploadedFile() file: UploadedBlob | undefined,
  ): Promise<ImportPreview> {
    if (!file) throw new BadRequestException('Choisissez un fichier.');
    return this.imports.preview(auth.userId, org, file);
  }

  @Post('org/customers/import')
  @ForOrg('customer.import')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES + 1, files: 1 } }),
  )
  commitImport(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @UploadedFile() file: UploadedBlob | undefined,
  ): Promise<ImportReport> {
    if (!file) throw new BadRequestException('Choisissez un fichier.');
    return this.imports.commit(auth.userId, org, file);
  }

  @Get('org/customers')
  @ForOrg('customer.view')
  list(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Query('q') q?: string,
    @Query('apres') cursor?: string,
  ): Promise<{ items: OrgCustomerInfo[]; next: string | null }> {
    if (cursor && !UUID.test(cursor)) throw new BadRequestException('Curseur invalide.');
    if (q && q.length > 100) throw new BadRequestException('Recherche trop longue.');
    return this.customers.list(auth.userId, org, q, cursor);
  }

  @Post('org/customers')
  @ForOrg('customer.edit')
  create(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Body(new ZodBody(OrgCustomerSchema)) body: OrgCustomerInput,
  ): Promise<OrgCustomerInfo> {
    return this.customers.create(auth.userId, org, body);
  }

  @Get('org/customers/:id')
  @ForOrg('customer.view')
  get(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrgCustomerInfo> {
    return this.customers.get(auth.userId, org, id);
  }

  @Patch('org/customers/:id')
  @ForOrg('customer.edit')
  update(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(OrgCustomerSchema)) body: OrgCustomerInput,
  ): Promise<OrgCustomerInfo> {
    return this.customers.update(auth.userId, org, id, body);
  }

  @Post('org/customers/:id/claim-link')
  @ForOrg('customer.invite_claim')
  claimLink(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ClaimLink> {
    return this.customers.createClaimLink(auth.userId, org, id);
  }

  @Post('customers/claim')
  @RequireVerifiedEmail()
  claim(
    @Auth() auth: AuthContext,
    @Body(new ZodBody(TokenSchema)) body: { token: string },
  ): Promise<ClaimResult> {
    return this.customers.claim(auth.userId, body.token);
  }
}
