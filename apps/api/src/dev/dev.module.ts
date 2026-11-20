import { Module } from '@nestjs/common';
import { DevOutboxController } from './dev-outbox.controller';

@Module({ controllers: [DevOutboxController] })
export class DevModule {}
