import { createTransport, type Transporter } from 'nodemailer';
import type { EmailSender, OutgoingEmail } from './email-sender';

/** Envoi par SMTP (Brevo en production). L'URL contient les identifiants : jamais dans le dépôt. */
export class SmtpEmailSender implements EmailSender {
  private readonly transporter: Transporter;

  constructor(
    smtpUrl: string,
    private readonly from: string,
  ) {
    this.transporter = createTransport(smtpUrl);
  }

  async send(email: OutgoingEmail): Promise<void> {
    await this.transporter.sendMail({ from: this.from, ...email });
  }
}
