import { Module } from '@nestjs/common';
import { ShipmentsService } from './shipments.service';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';

@Module({
  controllers: [TrackingController],
  providers: [TrackingService, ShipmentsService],
  exports: [TrackingService],
})
export class TrackingModule {}
