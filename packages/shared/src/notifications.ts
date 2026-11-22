import { z } from 'zod';

/** Les 13 événements du cahier (§6.12), plus les anomalies de colis (docs/05, §7). */
export const NOTIFICATION_TYPES = [
  'request_received',
  'quote_received',
  'quote_expiring',
  'payment_to_confirm',
  'payment_confirmed',
  'purchase_done',
  'items_received',
  'parcel_shipped',
  'parcel_arrived',
  'parcel_available',
  'out_for_delivery',
  'order_completed',
  'dispute_updated',
  'parcel_anomaly',
  'organization_status',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  request_received: 'Nouvelle demande de devis',
  quote_received: 'Nouveau devis',
  quote_expiring: 'Devis bientôt expiré',
  payment_to_confirm: 'Paiement à confirmer',
  payment_confirmed: 'Paiement confirmé',
  purchase_done: 'Achat effectué',
  items_received: 'Articles reçus à l’entrepôt',
  parcel_shipped: 'Colis expédié',
  parcel_arrived: 'Colis arrivé en RDC',
  parcel_available: 'Colis disponible',
  out_for_delivery: 'Livraison en cours',
  order_completed: 'Commande terminée',
  dispute_updated: 'Litige mis à jour',
  parcel_anomaly: 'Problème sur un colis',
  organization_status: 'Décision sur votre activité',
};

export const NOTIFICATION_CHANNELS = ['email', 'whatsapp'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export interface NotificationInfo {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationPreferenceInfo {
  type: NotificationType;
  label: string;
  email: boolean;
}

export const NotificationPreferencesSchema = z.object({
  preferences: z
    .array(z.object({ type: z.enum(NOTIFICATION_TYPES), email: z.boolean() }))
    .min(1)
    .max(NOTIFICATION_TYPES.length),
});
export type NotificationPreferencesInput = z.infer<typeof NotificationPreferencesSchema>;
