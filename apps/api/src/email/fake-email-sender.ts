import { Logger } from '@nestjs/common';
import type { EmailSender, OutgoingEmail } from './email-sender';

/**
 * FAUX expéditeur, pour le développement et les tests uniquement : garde les e-mails en mémoire
 * et affiche les liens dans les logs de développement. Refusé en production par la configuration.
 */
export class FakeEmailSender implements EmailSender {
  readonly outbox: OutgoingEmail[] = [];
  private readonly logger = new Logger('FakeEmailSender');

  async send(email: OutgoingEmail): Promise<void> {
    this.outbox.push(email);
    if (process.env.NODE_ENV === 'development') {
      this.logger.log(`[e-mail factice] à ${email.to} — ${email.subject}\n${email.text}`);
    }
  }

  /** Dernier e-mail reçu par `to`, pour les tests. */
  lastTo(to: string): OutgoingEmail | undefined {
    return [...this.outbox].reverse().find((e) => e.to === to);
  }
}
