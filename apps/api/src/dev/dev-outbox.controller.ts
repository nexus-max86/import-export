import { Controller, Get, Inject, NotFoundException, Query } from '@nestjs/common';
import { Public } from '../auth/decorators';
import { EMAIL_SENDER, type EmailSender, type OutgoingEmail } from '../email/email-sender';
import { FakeEmailSender } from '../email/fake-email-sender';

/**
 * Développement et tests de bout en bout uniquement : lit la boîte d'envoi FACTICE.
 * Ce module n'est chargé que si NODE_ENV ≠ production et EMAIL_TRANSPORT = fake (voir AppModule) ;
 * la configuration interdit déjà le transport factice en production.
 */
@Controller('_dev')
export class DevOutboxController {
  constructor(@Inject(EMAIL_SENDER) private readonly sender: EmailSender) {}

  @Public()
  @Get('outbox')
  last(@Query('to') to: string): OutgoingEmail {
    const email = this.sender instanceof FakeEmailSender ? this.sender.lastTo(to) : undefined;
    if (!email) throw new NotFoundException();
    return email;
  }
}
