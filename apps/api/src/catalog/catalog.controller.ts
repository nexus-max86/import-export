import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  analyzeProductUrl,
  LookupSchema,
  MAX_UPLOAD_BYTES,
  type ProductLookup,
  type UrlAnalysis,
} from '@konzia/shared';
import type { AuthContext } from '../auth/auth.types';
import { Auth } from '../auth/decorators';
import { RateLimitService } from '../common/rate-limit.service';
import { ZodBody } from '../common/zod-body.pipe';
import { FilesService, type UploadedBlob } from '../files/files.service';
import { TenantDb } from '../tenancy/tenant-db.service';
import { PRODUCT_FETCHER, type ProductFetcher } from './product-fetcher';

@Controller('catalog')
export class CatalogController {
  constructor(
    private readonly rateLimit: RateLimitService,
    private readonly files: FilesService,
    private readonly db: TenantDb,
    @Inject(PRODUCT_FETCHER) private readonly fetcher: ProductFetcher,
  ) {}

  /** Analyse d'un lien (sans le lire) : site reconnu, lien nettoyé, ou motif du refus. */
  @Post('analyze')
  @HttpCode(200)
  async analyze(
    @Auth() auth: AuthContext,
    @Body(new ZodBody(LookupSchema)) body: { url: string },
  ): Promise<UrlAnalysis> {
    await this.rateLimit.consume(`analyze:${auth.userId}`, 120, 3600);
    return analyzeProductUrl(body.url);
  }

  /**
   * Lecture des informations publiques de la page (titre, image, prix INDICATIF et daté).
   * Un échec n'est pas une erreur : le client complète l'article à la main.
   */
  @Post('lookup')
  @HttpCode(200)
  async lookup(
    @Auth() auth: AuthContext,
    @Body(new ZodBody(LookupSchema)) body: { url: string },
  ): Promise<ProductLookup> {
    await this.rateLimit.consume(`lookup:${auth.userId}`, 60, 3600);
    const analysis = analyzeProductUrl(body.url);
    if (!analysis.ok) throw new BadRequestException(analysis.reason);
    return this.fetcher.lookup(analysis);
  }

  /** Capture d'écran d'un article (quand le lien ne peut pas être lu). */
  @Post('screenshots')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES + 1, files: 1 } }),
  )
  async screenshot(
    @Auth() auth: AuthContext,
    @UploadedFile() file: UploadedBlob | undefined,
  ): Promise<{ fileId: string }> {
    if (!file) throw new BadRequestException('Choisissez une image.');
    await this.rateLimit.consume(`screenshot:${auth.userId}`, 60, 3600);
    const stored = await this.db.run(auth.userId, (tx) =>
      this.files.store(tx, auth.userId, null, 'product_screenshot', file),
    );
    return { fileId: stored.id };
  }
}
