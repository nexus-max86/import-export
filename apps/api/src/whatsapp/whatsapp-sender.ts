import { Logger } from '@nestjs/common';
import type { Env } from '../config/env';

/**
 * Envoi WhatsApp automatique (EF-93). Au MVP, les commissionnaires envoient eux-mêmes des
 * messages préremplis (liens wa.me) ; l'envoi automatique reste désactivé jusqu'à la
 * validation du compte par Meta. Interface interne : le fournisseur peut changer.
 */
export interface WhatsAppSender {
  readonly enabled: boolean;
  sendText(to: string, text: string): Promise<void>;
}

export const WHATSAPP_SENDER = Symbol('WHATSAPP_SENDER');

/** Désactivé : aucun envoi, jamais d'erreur (configuration par défaut). */
export class DisabledWhatsAppSender implements WhatsAppSender {
  readonly enabled = false;
  async sendText(): Promise<void> {}
}

/** FAUX expéditeur pour les tests ; refusé en production par la configuration. */
export class FakeWhatsAppSender implements WhatsAppSender {
  readonly enabled = true;
  readonly sent: { to: string; text: string }[] = [];
  async sendText(to: string, text: string): Promise<void> {
    this.sent.push({ to, text });
  }
}

/** API Cloud de WhatsApp (Meta). Le jeton n'apparaît jamais dans les journaux. */
export class CloudWhatsAppSender implements WhatsAppSender {
  readonly enabled = true;
  private readonly logger = new Logger('WhatsApp');

  constructor(
    private readonly token: string,
    private readonly phoneNumberId: string,
    private readonly version: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async sendText(to: string, text: string): Promise<void> {
    const res = await this.fetchFn(
      `https://graph.facebook.com/${this.version}/${this.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: to.replace(/\D/g, ''),
          type: 'text',
          text: { body: text, preview_url: false },
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) {
      this.logger.warn(`envoi WhatsApp refusé (HTTP ${res.status})`);
      throw Object.assign(new Error('WhatsAppSendFailed'), { code: `HTTP_${res.status}` });
    }
  }
}

export function createWhatsAppSender(env: Env): WhatsAppSender {
  if (env.WHATSAPP_TRANSPORT === 'cloud')
    return new CloudWhatsAppSender(
      env.WHATSAPP_TOKEN!,
      env.WHATSAPP_PHONE_NUMBER_ID!,
      env.WHATSAPP_API_VERSION,
    );
  if (env.WHATSAPP_TRANSPORT === 'fake') return new FakeWhatsAppSender();
  return new DisabledWhatsAppSender();
}
