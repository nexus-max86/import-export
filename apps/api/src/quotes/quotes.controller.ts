import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import {
  QuoteDraftSchema,
  QuoteSettingsSchema,
  type QuoteDraftInput,
  type QuoteInfo,
  type QuoteSettings,
} from '@konzia/shared';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.types';
import { Auth } from '../auth/decorators';
import { ZodBody } from '../common/zod-body.pipe';
import { ForOrg, Org, type OrgContext } from '../tenancy/org-context';
import { QuotesService } from './quotes.service';

const ReasonSchema = z.object({ reason: z.string().trim().min(3, 'Indiquez un motif.').max(500) });

@Controller('org')
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Get('quote-settings')
  @ForOrg('quote.edit')
  settings(@Auth() auth: AuthContext, @Org() org: OrgContext): Promise<QuoteSettings> {
    return this.quotes.getSettings(auth.userId, org);
  }

  @Put('quote-settings')
  @ForOrg('org.settings.edit')
  setSettings(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Body(new ZodBody(QuoteSettingsSchema)) body: QuoteSettings,
  ): Promise<QuoteSettings> {
    return this.quotes.setSettings(auth.userId, org, body);
  }

  @Post('requests/:id/quote')
  @ForOrg('quote.edit')
  open(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<QuoteInfo> {
    return this.quotes.open(auth.userId, org, id);
  }

  @Get('quotes/:id')
  @ForOrg('quote.edit')
  get(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<QuoteInfo> {
    return this.quotes.get(auth.userId, org, id);
  }

  @Put('quotes/:id/draft')
  @ForOrg('quote.edit')
  save(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(QuoteDraftSchema)) body: QuoteDraftInput,
  ): Promise<QuoteInfo> {
    return this.quotes.saveDraft(auth.userId, org, id, body);
  }

  @Post('quotes/:id/send')
  @ForOrg('quote.send')
  send(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<QuoteInfo> {
    return this.quotes.send(auth.userId, org, id);
  }

  @Post('quotes/:id/revise')
  @ForOrg('quote.edit')
  revise(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<QuoteInfo> {
    return this.quotes.revise(auth.userId, org, id);
  }

  @Post('quotes/:id/withdraw')
  @ForOrg('quote.withdraw')
  withdraw(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(ReasonSchema)) body: { reason: string },
  ): Promise<QuoteInfo> {
    return this.quotes.withdraw(auth.userId, org, id, body.reason);
  }
}
