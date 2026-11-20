import { Module } from '@nestjs/common';
import { VerifiedEmailGuard } from '../auth/verified-email.guard';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  controllers: [CustomersController],
  providers: [CustomersService, VerifiedEmailGuard],
  exports: [CustomersService],
})
export class CustomersModule {}
