import { Global, Module } from '@nestjs/common';
import { EmailChannel } from './email-channel';
import { EmailQueue } from './email-queue';
import { NotificationsController } from './notifications.controller';
import { NOTIFICATION_CHANNELS, NotificationsService } from './notifications.service';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    EmailQueue,
    EmailChannel,
    { provide: NOTIFICATION_CHANNELS, useExisting: EmailChannel },
  ],
  exports: [NotificationsService, EmailQueue],
})
export class NotificationsModule {}
