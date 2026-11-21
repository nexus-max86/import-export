import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  MAX_UPLOAD_BYTES,
  REQUIRED_DOCUMENTS,
  type VerificationDocumentKind,
  type VerificationInfo,
} from '@konzia/shared';
import type { Response } from 'express';
import type { AuthContext } from '../auth/auth.types';
import { Auth } from '../auth/decorators';
import type { UploadedBlob } from '../files/files.service';
import { ForOrg, Org, type OrgContext } from '../tenancy/org-context';
import { VerificationService } from './verification.service';

@Controller('org/verification')
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Get()
  @ForOrg('org.verification.submit')
  get(@Auth() auth: AuthContext, @Org() org: OrgContext): Promise<VerificationInfo> {
    return this.verification.get(auth.userId, org);
  }

  @Post('documents')
  @ForOrg('org.verification.submit')
  // Stockage en mémoire par défaut (pas de « dest »). Un octet de plus que la limite : le service renvoie un message clair au lieu d'une erreur multer.
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_BYTES + 1, files: 1 },
    }),
  )
  upload(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Body('kind') kind: string,
    @UploadedFile() file: UploadedBlob | undefined,
  ): Promise<VerificationInfo> {
    if (!REQUIRED_DOCUMENTS.includes(kind as VerificationDocumentKind)) {
      throw new BadRequestException('Type de document inconnu.');
    }
    if (!file) throw new BadRequestException('Choisissez un fichier.');
    return this.verification.upload(auth.userId, org, kind as VerificationDocumentKind, file);
  }

  @Delete('documents/:id')
  @ForOrg('org.verification.submit')
  remove(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VerificationInfo> {
    return this.verification.removeDocument(auth.userId, org, id);
  }

  @Post('submit')
  @ForOrg('org.verification.submit')
  submit(@Auth() auth: AuthContext, @Org() org: OrgContext): Promise<VerificationInfo> {
    return this.verification.submit(auth.userId, org);
  }

  @Get('documents/:id')
  @ForOrg('org.verification.submit')
  async download(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const doc = await this.verification.download(auth.userId, org, id);
    res.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(doc.content, {
      type: doc.mime,
      disposition: `inline; filename="${encodeURIComponent(doc.originalName)}"`,
    });
  }
}
