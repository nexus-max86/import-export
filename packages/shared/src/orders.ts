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

export interface OrderDetail extends OrderSummary {
  agreedTotalAmount: number;
  quoteVersionNo: number;
  quoteId: string;
  quoteRequestId: string;
  cancelledReason: string | null;
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
