import { z } from 'zod';

export const QUOTE_LINE_KINDS = [
  'product',
  'seller_shipping',
  'service_fee',
  'international_shipping',
  'handling',
  'customs_estimate',
  'local_delivery',
  'insurance',
  'discount',
] as const;
export type QuoteLineKind = (typeof QUOTE_LINE_KINDS)[number];

export const QUOTE_LINE_LABELS: Record<QuoteLineKind, string> = {
  product: 'Article',
  seller_shipping: 'Livraison du vendeur jusqu’à l’entrepôt',
  service_fee: 'Commission de service',
  international_shipping: 'Transport jusqu’en RDC',
  handling: 'Manutention / entrepôt',
  customs_estimate: 'Douane',
  local_delivery: 'Livraison locale',
  insurance: 'Assurance',
  discount: 'Réduction',
};

export const QUOTE_CURRENCIES = ['USD', 'CDF'] as const;
export type QuoteCurrency = (typeof QUOTE_CURRENCIES)[number];

const amount = z.number().int('Montant en centimes entiers.').min(0).max(10_000_000_000);

export const QuoteLineSchema = z.object({
  kind: z.enum(QUOTE_LINE_KINDS),
  quoteRequestItemId: z.uuid().nullable().optional(),
  description: z.string().trim().min(1, 'Décrivez la ligne.').max(300),
  quantity: z.number().int().min(1).max(10000),
  unitAmount: amount,
  /** Estimation (douane, transport…) : le montant final peut varier. */
  isEstimate: z.boolean().default(false),
});
export type QuoteLineInput = z.infer<typeof QuoteLineSchema>;

export const QuoteDraftSchema = z.object({
  currency: z.enum(QUOTE_CURRENCIES),
  lines: z.array(QuoteLineSchema).min(1).max(100),
  validUntil: z.iso.datetime({ message: 'Date de validité invalide.' }),
  leadTimeMinDays: z.number().int().min(1).max(365),
  leadTimeMaxDays: z.number().int().min(1).max(365),
  weightGrams: z.number().int().min(0).max(10_000_000).nullable().optional(),
  assumptions: z.string().trim().max(2000).nullable().optional(),
  cancellationTerms: z.string().trim().max(2000).nullable().optional(),
});
export type QuoteDraftInput = z.infer<typeof QuoteDraftSchema>;

/** Montant d'une ligne : quantité × prix unitaire, négatif pour une réduction. */
export function lineAmount(l: {
  kind: QuoteLineKind;
  quantity: number;
  unitAmount: number;
}): bigint {
  const a = BigInt(l.quantity) * BigInt(l.unitAmount);
  return l.kind === 'discount' ? -a : a;
}

export function quoteTotals(
  lines: { kind: QuoteLineKind; quantity: number; unitAmount: number }[],
) {
  const products = lines
    .filter((l) => l.kind === 'product')
    .reduce((s, l) => s + lineAmount(l), 0n);
  const total = lines.reduce((s, l) => s + lineAmount(l), 0n);
  return { products, total };
}

/** Commission en points de base (1 % = 100) appliquée au sous-total des articles, arrondie au centime. */
export function commissionOn(productsSubtotal: bigint, bps: number): bigint {
  return (productsSubtotal * BigInt(bps) + 5_000n) / 10_000n;
}

/** Transport au kilo : poids en grammes × tarif par kilo (unité mineure), arrondi au centime. */
export function transportFor(weightGrams: number, perKgAmount: number): bigint {
  return (BigInt(weightGrams) * BigInt(perKgAmount) + 500n) / 1000n;
}

export const QuoteSettingsSchema = z.object({
  /** Commission en points de base : 1000 = 10 %. */
  commissionBps: z.number().int().min(0).max(10000).nullable(),
  transportPerKg: z.object({ amount: amount, currency: z.enum(QUOTE_CURRENCIES) }).nullable(),
});
export type QuoteSettings = z.infer<typeof QuoteSettingsSchema>;

export type QuoteStatus =
  | 'draft'
  | 'sent'
  | 'accepted'
  | 'rejected'
  | 'changes_requested'
  | 'expired'
  | 'withdrawn';
export type QuoteVersionStatus =
  | 'draft'
  | 'sent'
  | 'superseded'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'withdrawn';

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'Devis en préparation',
  sent: 'Devis envoyé',
  accepted: 'Devis accepté',
  rejected: 'Devis refusé',
  changes_requested: 'Correction demandée',
  expired: 'Devis expiré',
  withdrawn: 'Devis retiré',
};

export interface QuoteLineInfo {
  id: string;
  position: number;
  kind: QuoteLineKind;
  quoteRequestItemId: string | null;
  description: string;
  quantity: number;
  unitAmount: number;
  amount: number;
  isEstimate: boolean;
}

export interface QuoteVersionInfo {
  id: string;
  versionNo: number;
  status: QuoteVersionStatus;
  currency: QuoteCurrency;
  productsAmount: number;
  totalAmount: number;
  /** Taux copiés à l'envoi (texte décimal exact), nuls pour un brouillon. */
  fxUsdCdf: string | null;
  fxSource: string | null;
  fxAt: string | null;
  validUntil: string;
  leadTimeMinDays: number;
  leadTimeMaxDays: number;
  weightGrams: number | null;
  assumptions: string | null;
  cancellationTerms: string | null;
  sentAt: string | null;
  lines: QuoteLineInfo[];
}

export interface QuoteInfo {
  id: string;
  quoteRequestId: string;
  organizationName: string;
  organizationSlug: string;
  status: QuoteStatus;
  /** Version de travail (commissionnaire) ou dernière version envoyée (client). */
  current: QuoteVersionInfo | null;
  /** Versions envoyées précédemment, toujours consultables. */
  previous: QuoteVersionInfo[];
  changeRequest: string | null;
}
