import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  AcceptQuoteSchema,
  RejectQuoteSchema,
  RequestChangesSchema,
  type QuoteInfo,
} from '@konzia/shared';
import type { AuthContext } from '../auth/auth.types';
import { Auth } from '../auth/decorators';
import { RequireVerifiedEmail } from '../auth/verified-email.guard';
import { ZodBody } from '../common/zod-body.pipe';
import { CustomerQuotesService } from './customer-quotes.service';

@Controller()
export class CustomerQuotesController {
  constructor(private readonly quotes: CustomerQuotesService) {}

  @Get('requests/:id/quotes')
  list(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string): Promise<QuoteInfo[]> {
    return this.quotes.listForRequest(auth.userId, id);
  }

  @Post('quotes/:id/accept')
  @RequireVerifiedEmail()
  accept(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(AcceptQuoteSchema)) body: { versionId: string },
  ): Promise<{ orderId: string; number: string }> {
    return this.quotes.accept(auth.userId, id, body.versionId);
  }

  @Post('quotes/:id/reject')
  @HttpCode(204)
  reject(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(RejectQuoteSchema)) body: { reason?: string | null },
  ): Promise<void> {
    return this.quotes.reject(auth.userId, id, body.reason ?? null);
  }

  @Post('quotes/:id/request-changes')
  @HttpCode(204)
  requestChanges(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(RequestChangesSchema)) body: { message: string },
  ): Promise<void> {
    return this.quotes.requestChanges(auth.userId, id, body.message);
  }
}
