export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
}

/** Interface interne : le fournisseur (Brevo, autre SMTP) peut changer sans toucher au métier. */
export interface EmailSender {
  send(email: OutgoingEmail): Promise<void>;
}

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');
