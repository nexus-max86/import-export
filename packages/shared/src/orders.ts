import { z } from 'zod';

export type OrderStatus =
  | 'awaiting_payment'
  | 'payment_to_verify'
  | 'paid'
  | 'purchasing'
  | 'partially_purchased'
  | 'purchased'
  | 'in_logistics'
  | 'in_transit'
  | 'at_distribution_point'
  | 'ready_for_handover'
  | 'completed'
  | 'cancelled'
  | 'in_dispute';

export type OrderPaymentStatus =
  | 'unpaid'
  | 'partially_paid'
  | 'paid'
  | 'partially_refunded'
  | 'refunded';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting_payment: 'En attente de paiement',
  payment_to_verify: 'Paiement à vérifier',
  paid: 'Payée',
  purchasing: 'Achat en cours',
  partially_purchased: 'Partiellement achetée',
  purchased: 'Achetée',
  in_logistics: 'En préparation logistique',
  in_transit: 'En transport',
  at_distribution_point: 'Arrivée au point de distribution',
  ready_for_handover: 'Prête pour retrait ou livraison',
  completed: 'Terminée',
  cancelled: 'Annulée',
  in_dispute: 'En litige',
};

export const PAYMENT_STATUS_LABELS: Record<OrderPaymentStatus, string> = {
  unpaid: 'Non payée',
  partially_paid: 'Partiellement payée',
  paid: 'Payée',
  partially_refunded: 'Partiellement remboursée',
  refunded: 'Remboursée',
};

export const AcceptQuoteSchema = z.object({ versionId: z.uuid() });
export const RejectQuoteSchema = z.object({
  reason: z.string().trim().max(500).nullable().optional(),
});
export const RequestChangesSchema = z.object({
  message: z.string().trim().min(3, 'Expliquez ce qu’il faut corriger.').max(1000),
});

export interface OrderSummary {
  id: string;
  number: string;
  organizationName: string;
  customerName: string;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  currency: string;
  finalAmount: number;
  createdAt: string;
}

/** Étapes qu'un commissionnaire peut faire avancer lui-même (le paiement a ses propres écrans). */
export const ORG_NEXT_STATUSES: Partial<Record<OrderStatus, OrderStatus[]>> = {
  // Avant paiement complet : seulement si la règle d'achat le permet (acompte, fonds propres).
  awaiting_payment: ['purchasing'],
  payment_to_verify: ['purchasing'],
  paid: ['purchasing'],
  purchasing: ['partially_purchased', 'purchased'],
  partially_purchased: ['purchased'],
  purchased: ['in_logistics'],
  in_logistics: ['in_transit'],
  in_transit: ['at_distribution_point'],
  at_distribution_point: ['ready_for_handover'],
  ready_for_handover: ['completed'],
};

export const CANCELLABLE_STATUSES: OrderStatus[] = [
  'awaiting_payment',
  'payment_to_verify',
  'paid',
];

export const UpdateOrderStatusSchema = z.object({
  status: z.enum(Object.keys(ORDER_STATUS_LABELS) as [OrderStatus, ...OrderStatus[]]),
  note: z.string().trim().max(500).nullable().optional(),
});
export const CancelOrderSchema = z.object({
  reason: z.string().trim().min(3, 'Indiquez le motif.').max(500),
});
export const ProposeAdjustmentSchema = z.object({
  amountDelta: z
    .number()
    .int('Montant en centimes entiers.')
    .min(-1_000_000_000)
    .max(1_000_000_000)
    .refine((v) => v !== 0, 'Le montant ne peut pas être nul.'),
  reason: z.string().trim().min(3, 'Expliquez la raison de l’ajustement.').max(500),
});
export const DecideAdjustmentSchema = z.object({ accepted: z.boolean() });
export const RecordAdjustmentDecisionSchema = z.object({
  accepted: z.boolean(),
  note: z
    .string()
    .trim()
    .min(3, 'Indiquez comment le client a répondu (ex. « accord par WhatsApp le 21/11 »).')
    .max(500),
});

export interface AdjustmentInfo {
  id: string;
  amountDelta: number;
  reason: string;
  status: 'proposed' | 'accepted' | 'rejected' | 'cancelled';
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
}

export interface OrderDetail extends OrderSummary {
  agreedTotalAmount: number;
  quoteVersionNo: number;
  quoteId: string;
  quoteRequestId: string;
  cancelledReason: string | null;
  purchaseRule: PurchaseRule;
  depositBps: number | null;
  /** Vrai si le client a un compte Konzia (sinon le commissionnaire enregistre ses réponses). */
  customerHasAccount: boolean;
  /** WhatsApp de l'autre partie : le client (vue commissionnaire) ou le commissionnaire (vue client). */
  contactWhatsapp: string | null;
  /** Total net encaissé (paiements confirmés moins remboursements), dans la devise de la commande. */
  netPaid: number;
  adjustments: AdjustmentInfo[];
  items: {
    id: string;
    description: string;
    quantity: number;
    unitAmount: number;
    amount: number;
    qtyPurchased: number;
    qtyReceived: number;
  }[];
  events: {
    type: string;
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus | null;
    note: string | null;
    at: string;
  }[];
}

export const PURCHASE_RULES = ['full_payment', 'deposit', 'own_funds'] as const;
export type PurchaseRule = (typeof PURCHASE_RULES)[number];
export const PURCHASE_RULE_LABELS: Record<PurchaseRule, string> = {
  full_payment: 'Achat après paiement complet',
  deposit: 'Achat après un acompte',
  own_funds: 'Achat sur mes fonds propres',
};
export const PurchaseRuleSchema = z
  .object({
    rule: z.enum(PURCHASE_RULES),
    depositBps: z.number().int().min(1).max(10000).nullable().optional(),
  })
  .refine((r) => (r.rule === 'deposit') === (r.depositBps != null), {
    message: 'Indiquez le pourcentage d’acompte.',
    path: ['depositBps'],
  });
