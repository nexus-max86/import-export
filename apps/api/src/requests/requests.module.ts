import { Module } from '@nestjs/common';
import { VerifiedEmailGuard } from '../auth/verified-email.guard';
import { CustomersModule } from '../customers/customers.module';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

@Module({
  imports: [CustomersModule],
  controllers: [RequestsController],
  providers: [RequestsService, VerifiedEmailGuard],
})
export class RequestsModule {}
