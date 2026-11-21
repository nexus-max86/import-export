import { Global, Module } from '@nestjs/common';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { createWhatsAppSender, WHATSAPP_SENDER } from './whatsapp-sender';

@Global()
@Module({
  providers: [
    {
      provide: WHATSAPP_SENDER,
      inject: [ENV],
      useFactory: (env: Env) => createWhatsAppSender(env),
    },
  ],
  exports: [WHATSAPP_SENDER],
})
export class WhatsAppModule {}
