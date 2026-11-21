import { z } from 'zod';

export const PAYMENT_METHODS = ['mobile_money', 'cash', 'bank_transfer', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  mobile_money: 'Mobile Money',
  cash: 'Espèces',
  bank_transfer: 'Virement bancaire',
  other: 'Autre',
};

export const MOBILE_MONEY_PROVIDERS = [
  'M-Pesa',
  'Orange Money',
  'Airtel Money',
  'Afrimoney',
] as const;

export const PaymentInstructionSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  provider: z.string().trim().max(60).nullable().optional(),
  accountName: z.string().trim().min(2, 'Indiquez le titulaire.').max(100),
  accountNumber: z.string().trim().max(100).nullable().optional(),
  details: z.string().trim().max(500).nullable().optional(),
});
export type PaymentInstruction = z.infer<typeof PaymentInstructionSchema>;
export const PaymentInstructionsSchema = z.object({
  instructions: z.array(PaymentInstructionSchema).max(10),
});

const amount = z
  .number()
  .int('Montant en centimes entiers.')
  .positive('Le montant doit être positif.')
  .max(10_000_000_000);
const currency = z.enum(['USD', 'CDF']);

export const DeclarePaymentSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  provider: z.string().trim().max(60).nullable().optional(),
  amount,
  currency,
  reference: z.string().trim().max(100).nullable().optional(),
  proofFileId: z.uuid().nullable().optional(),
  /** Clé générée par l'appareil : un envoi répété après une coupure réseau ne crée pas de doublon. */
  idempotencyKey: z.uuid(),
});
export type DeclarePaymentInput = z.infer<typeof DeclarePaymentSchema>;

export const RecordPaymentSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  provider: z.string().trim().max(60).nullable().optional(),
  amount,
  currency,
  reference: z.string().trim().max(100).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  idempotencyKey: z.uuid(),
});
export type RecordPaymentInput = z.infer<typeof RecordPaymentSchema>;

export const RefundSchema = RecordPaymentSchema.extend({
  note: z.string().trim().min(3, 'Indiquez le motif du remboursement.').max(500),
});
export type RefundInput = z.infer<typeof RefundSchema>;

export const RejectPaymentSchema = z.object({
  reason: z.string().trim().min(3, 'Indiquez le motif du refus.').max(500),
});

export type PaymentStatusCode = 'pending_verification' | 'confirmed' | 'rejected' | 'cancelled';

export const PAYMENT_STATE_LABELS: Record<PaymentStatusCode, string> = {
  pending_verification: 'À vérifier',
  confirmed: 'Confirmé',
  rejected: 'Refusé',
  cancelled: 'Annulé',
};

export interface PaymentInfo {
  id: string;
  orderId: string;
  orderNumber: string;
  kind: 'payment' | 'refund';
  method: PaymentMethod;
  provider: string | null;
  amount: number;
  currency: string;
  orderAmount: number;
  orderCurrency: string;
  fxRate: string | null;
  reference: string | null;
  note: string | null;
  hasProof: boolean;
  status: PaymentStatusCode;
  rejectionReason: string | null;
  declaredByCustomer: boolean;
  confirmedAt: string | null;
  createdAt: string;
}

/** « Qui doit combien » : soldes par client et par devise. */
export interface CustomerBalance {
  orgCustomerId: string;
  customerName: string;
  currency: string;
  due: number;
  paid: number;
  outstanding: number;
  pendingVerification: number;
  orders: {
    id: string;
    number: string;
    finalAmount: number;
    paid: number;
    outstanding: number;
    paymentStatus: string;
  }[];
}
