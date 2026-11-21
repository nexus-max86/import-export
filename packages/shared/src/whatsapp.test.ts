import { describe, expect, it } from 'vitest';
import { whatsappLink } from './phone';
import { customerWhatsappMessage, suggestedTemplate, whatsappMessage } from './whatsapp';

describe('messages WhatsApp préremplis', () => {
  const ctx = {
    customerName: 'Ruth Kabeya',
    organizationName: 'Kaseba Import',
    orderNumber: 'KZ-2026-000087',
    amount: '45,00 USD',
  };

  it('rappel de paiement : prénom, montant, commande, signature', () => {
    expect(whatsappMessage('payment_reminder', ctx)).toBe(
      'Bonjour Ruth, il reste 45,00 USD à payer (commande KZ-2026-000087). Je lance l’achat dès réception.\n— Kaseba Import',
    );
  });

  it('ajoute le lien seulement si le client a un compte', () => {
    expect(
      whatsappMessage('shipped', { ...ctx, link: 'https://konzia.app/commandes/x' }),
    ).toContain('\nDétails : https://konzia.app/commandes/x\n');
    expect(whatsappMessage('shipped', ctx)).not.toContain('Détails');
  });

  it('propose le bon modèle selon l’étape', () => {
    expect(suggestedTemplate('awaiting_payment', false)).toBe('payment_reminder');
    expect(suggestedTemplate('paid', true)).toBe('payment_received');
    expect(suggestedTemplate('in_transit', true)).toBe('shipped');
    expect(suggestedTemplate('ready_for_handover', true)).toBe('ready_for_pickup');
  });

  it('le lien wa.me encode le message et le numéro', () => {
    expect(whatsappLink('+243810000000', customerWhatsappMessage('KZ-2026-000087'))).toBe(
      'https://wa.me/243810000000?text=Bonjour%2C%20je%20vous%20%C3%A9cris%20au%20sujet%20de%20ma%20commande%20KZ-2026-000087.',
    );
  });
});
