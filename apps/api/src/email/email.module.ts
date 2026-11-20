import { Global, Module } from '@nestjs/common';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { EMAIL_SENDER } from './email-sender';
import { FakeEmailSender } from './fake-email-sender';
import { SmtpEmailSender } from './smtp-email-sender';

@Global()
@Module({
  providers: [
    {
      provide: EMAIL_SENDER,
      inject: [ENV],
      useFactory: (env: Env) =>
        env.EMAIL_TRANSPORT === 'smtp' && env.SMTP_URL
          ? new SmtpEmailSender(env.SMTP_URL, env.EMAIL_FROM)
          : new FakeEmailSender(),
    },
  ],
  exports: [EMAIL_SENDER],
})
export class EmailModule {}
