import { Module } from '@nestjs/common';
import { CustomerTrackingService } from './customer-tracking.service';
import { ShipmentsService } from './shipments.service';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';

@Module({
  controllers: [TrackingController],
  providers: [TrackingService, ShipmentsService, CustomerTrackingService],
  exports: [TrackingService],
})
export class TrackingModule {}
