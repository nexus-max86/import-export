import type { OrderStatus } from './orders';

/**
 * Messages WhatsApp préremplis (retour terrain R6) : le commissionnaire n'a plus à retaper les
 * mêmes réponses. Le texte s'ouvre dans WhatsApp (lien wa.me) et reste modifiable avant envoi.
 */
export const WHATSAPP_TEMPLATES = [
  'quote_ready',
  'payment_reminder',
  'payment_received',
  'purchased',
  'shipped',
  'arrived',
  'ready_for_pickup',
  'free_text',
] as const;
export type WhatsAppTemplate = (typeof WHATSAPP_TEMPLATES)[number];

export const WHATSAPP_TEMPLATE_LABELS: Record<WhatsAppTemplate, string> = {
  quote_ready: 'Devis prêt',
  payment_reminder: 'Rappel de paiement',
  payment_received: 'Paiement reçu',
  purchased: 'Articles achetés',
  shipped: 'Colis parti vers la RDC',
  arrived: 'Colis arrivé à Lubumbashi',
  ready_for_pickup: 'Prêt pour retrait ou livraison',
  free_text: 'Message libre',
};

export interface WhatsAppContext {
  customerName: string;
  organizationName: string;
  orderNumber?: string;
  /** Montant déjà formaté (« 135,68 USD »). */
  amount?: string;
  /** Lien vers la commande ou le devis, si le client a un compte. */
  link?: string | null;
}

export function whatsappMessage(template: WhatsAppTemplate, c: WhatsAppContext): string {
  const hello = `Bonjour ${firstName(c.customerName)},`;
  const order = c.orderNumber ? ` (commande ${c.orderNumber})` : '';
  const link = c.link ? `\nDétails : ${c.link}` : '';
  const sign = `\n— ${c.organizationName}`;
  const body: Record<WhatsAppTemplate, string> = {
    quote_ready: `votre devis est prêt${c.amount ? ` : ${c.amount}` : ''}. Dites-moi si vous l’acceptez.`,
    payment_reminder: `il reste ${c.amount ?? 'un montant'} à payer${order}. Je lance l’achat dès réception.`,
    payment_received: `j’ai bien reçu votre paiement${c.amount ? ` de ${c.amount}` : ''}${order}. Merci !`,
    purchased: `vos articles ont été achetés auprès du vendeur${order}.`,
    shipped: `votre colis est parti vers la RDC${order}. Je vous préviens à son arrivée.`,
    arrived: `votre colis est arrivé à Lubumbashi${order}.`,
    ready_for_pickup: `votre commande est prête${order} : vous pouvez passer la retirer, ou je vous la fais livrer.`,
    free_text: '',
  };
  if (template === 'free_text') return `${hello}\n${sign.trim()}`;
  return `${hello} ${body[template]}${link}${sign}`;
}

/** Modèle conseillé selon l'étape de la commande. */
export function suggestedTemplate(status: OrderStatus, fullyPaid: boolean): WhatsAppTemplate {
  if (!fullyPaid && ['awaiting_payment', 'payment_to_verify'].includes(status))
    return 'payment_reminder';
  switch (status) {
    case 'paid':
      return 'payment_received';
    case 'purchasing':
    case 'partially_purchased':
    case 'purchased':
    case 'in_logistics':
      return 'purchased';
    case 'in_transit':
      return 'shipped';
    case 'at_distribution_point':
      return 'arrived';
    case 'ready_for_handover':
      return 'ready_for_pickup';
    default:
      return 'free_text';
  }
}

/** Message du client vers son commissionnaire, avec le numéro de commande. */
export function customerWhatsappMessage(orderNumber: string): string {
  return `Bonjour, je vous écris au sujet de ma commande ${orderNumber}.`;
}

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? full;
}
