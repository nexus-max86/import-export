import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { analyzeProductUrl, type UrlAnalysis } from '@konzia/shared';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.types';
import { Auth } from '../auth/decorators';
import { RateLimitService } from '../common/rate-limit.service';
import { ZodBody } from '../common/zod-body.pipe';

const AnalyzeSchema = z.object({ url: z.string().max(4000) });

@Controller('catalog')
export class CatalogController {
  constructor(private readonly rateLimit: RateLimitService) {}

  /** Analyse d'un lien (sans le lire) : site reconnu, lien nettoyé, ou motif du refus. */
  @Post('analyze')
  @HttpCode(200)
  async analyze(
    @Auth() auth: AuthContext,
    @Body(new ZodBody(AnalyzeSchema)) body: { url: string },
  ): Promise<UrlAnalysis> {
    await this.rateLimit.consume(`analyze:${auth.userId}`, 120, 3600);
    return analyzeProductUrl(body.url);
  }
}
