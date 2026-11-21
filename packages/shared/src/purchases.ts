import { z } from 'zod';
import { MARKETPLACE_CODES, type MarketplaceCode } from './organizations';

export const SUPPLIER_CURRENCIES = ['USD', 'CNY', 'CDF'] as const;

export const SupplierOrderSchema = z.object({
  marketplace: z
    .enum(MARKETPLACE_CODES as [MarketplaceCode, ...MarketplaceCode[]])
    .nullable()
    .optional(),
  storeName: z.string().trim().min(1, 'Indiquez la boutique ou le vendeur.').max(200),
  externalRef: z.string().trim().max(100).nullable().optional(),
  purchasedAt: z.iso.datetime(),
  amount: z.number().int().positive('Montant payé au vendeur, en centimes.').max(10_000_000_000),
  currency: z.enum(SUPPLIER_CURRENCIES),
  conversionFeeAmount: z.number().int().min(0).max(1_000_000_000).default(0),
  sellerTrackingNumber: z.string().trim().max(100).nullable().optional(),
  proofFileId: z.uuid().nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  items: z
    .array(z.object({ orderItemId: z.uuid(), quantity: z.number().int().min(1).max(10000) }))
    .min(1, 'Choisissez au moins un article.')
    .max(200),
});
export type SupplierOrderInput = z.infer<typeof SupplierOrderSchema>;

export const ReceiveSchema = z.object({
  items: z
    .array(z.object({ orderItemId: z.uuid(), qtyReceived: z.number().int().min(0).max(10000) }))
    .min(1),
});
export type ReceiveInput = z.infer<typeof ReceiveSchema>;

export const UpdateSupplierOrderSchema = z.object({
  sellerTrackingNumber: z.string().trim().max(100).nullable().optional(),
  status: z.literal('shipped_by_seller').optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});

export type SupplierOrderStatus =
  | 'placed'
  | 'shipped_by_seller'
  | 'partially_received'
  | 'received'
  | 'refunded'
  | 'cancelled';

export const SUPPLIER_STATUS_LABELS: Record<SupplierOrderStatus, string> = {
  placed: 'Commandé chez le vendeur',
  shipped_by_seller: 'Expédié par le vendeur',
  partially_received: 'Reçu en partie',
  received: 'Reçu',
  refunded: 'Remboursé par le vendeur',
  cancelled: 'Annulé',
};

export interface SupplierOrderInfo {
  id: string;
  marketplace: MarketplaceCode | null;
  storeName: string;
  externalRef: string | null;
  purchasedAt: string;
  amount: number;
  currency: string;
  conversionFeeAmount: number;
  sellerTrackingNumber: string | null;
  hasProof: boolean;
  note: string | null;
  status: SupplierOrderStatus;
  items: {
    orderItemId: string;
    orderId: string;
    orderNumber: string;
    description: string;
    qtyPurchased: number;
    qtyReceived: number;
  }[];
}

/** Article de commande encore à acheter (pour composer un achat groupé). */
export interface PurchasableItem {
  orderItemId: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  description: string;
  quantity: number;
  qtyPurchased: number;
  canPurchase: boolean;
  blockedReason: string | null;
}
