import { Module } from '@nestjs/common';
import { TrackingModule } from '../tracking/tracking.module';
import { ParcelsController } from './parcels.controller';
import { ParcelsService } from './parcels.service';

@Module({
  imports: [TrackingModule],
  controllers: [ParcelsController],
  providers: [ParcelsService],
})
export class ParcelsModule {}
