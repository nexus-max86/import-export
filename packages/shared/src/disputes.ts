import { z } from 'zod';

export const DISPUTE_CATEGORIES = [
  'not_received',
  'damaged',
  'wrong_item',
  'missing_items',
  'payment',
  'delay',
  'other',
] as const;
export type DisputeCategory = (typeof DISPUTE_CATEGORIES)[number];
export const DISPUTE_CATEGORY_LABELS: Record<DisputeCategory, string> = {
  not_received: 'Commande non reçue',
  damaged: 'Article abîmé',
  wrong_item: 'Article différent de la commande',
  missing_items: 'Articles manquants',
  payment: 'Problème de paiement',
  delay: 'Retard important',
  other: 'Autre problème',
};

export type DisputeStatus = 'awaiting_commissioner' | 'under_review' | 'resolved' | 'closed';
export const DISPUTE_STATUS_LABELS: Record<DisputeStatus, string> = {
  awaiting_commissioner: 'En attente du commissionnaire',
  under_review: 'En cours d’examen par Konzia',
  resolved: 'Décision rendue',
  closed: 'Clos',
};

const fileIds = z.array(z.uuid()).max(5, '5 pièces au maximum.').default([]);

export const OpenDisputeSchema = z.object({
  category: z.enum(DISPUTE_CATEGORIES, { message: 'Choisissez le type de problème.' }),
  description: z.string().trim().min(10, 'Décrivez le problème (10 caractères minimum).').max(3000),
  fileIds,
});
export type OpenDisputeInput = z.infer<typeof OpenDisputeSchema>;

export const DisputeMessageSchema = z.object({
  body: z.string().trim().min(2, 'Écrivez un message.').max(3000),
  fileIds,
});
export type DisputeMessageInput = z.infer<typeof DisputeMessageSchema>;

export const ResolveDisputeSchema = z.object({
  resolution: z.string().trim().min(10, 'Expliquez la décision (10 caractères minimum).').max(3000),
});
export const ReopenDisputeSchema = z.object({
  reason: z.string().trim().min(5, 'Expliquez la réouverture.').max(1000),
});

export interface DisputeInfo {
  id: string;
  orderId: string;
  orderNumber: string;
  organizationName: string;
  customerName: string;
  category: DisputeCategory;
  description: string;
  status: DisputeStatus;
  resolution: string | null;
  reopenReason: string | null;
  createdAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  messages: {
    id: string;
    authorRole: 'customer' | 'commissioner' | 'support';
    authorName: string;
    body: string;
    files: { id: string; name: string }[];
    createdAt: string;
  }[];
}
