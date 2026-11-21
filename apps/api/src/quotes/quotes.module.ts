import { Module } from '@nestjs/common';
import { VerifiedEmailGuard } from '../auth/verified-email.guard';
import { CustomerQuotesController } from './customer-quotes.controller';
import { CustomerQuotesService } from './customer-quotes.service';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

@Module({
  controllers: [QuotesController, CustomerQuotesController],
  providers: [QuotesService, CustomerQuotesService, VerifiedEmailGuard],
  exports: [QuotesService, CustomerQuotesService],
})
export class QuotesModule {}
