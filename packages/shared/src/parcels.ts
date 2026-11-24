import { z } from 'zod';
import type { TrackingEventInfo, TrackingStepCode } from './tracking';

/** Alphabet des codes de colis : sans 0/O ni 1/I, pour la lecture à voix haute et au téléphone. */
export const PARCEL_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const PARCEL_CODE_PATTERN = /^KZ-P-[0-9A-HJ-NP-Z]{6}$/;

/** Code lisible d'un colis (ex. KZ-P-7KD3QX) à partir d'octets aléatoires. */
export function parcelCode(random: Uint8Array): string {
  if (random.length < 6) throw new Error('6 octets aléatoires attendus');
  let code = '';
  for (let i = 0; i < 6; i++)
    code += PARCEL_CODE_ALPHABET[random[i]! % PARCEL_CODE_ALPHABET.length];
  return `KZ-P-${code}`;
}

/** Diviseurs volumétriques courants (cm³ par kg) : 5000 (express), 6000 (fret aérien). */
export const VOLUMETRIC_DIVISORS = [5000, 6000] as const;

/**
 * Poids volumétrique en grammes : L × l × h (cm) / diviseur, en kg.
 * Avec des millimètres : mm³ / diviseur donne directement des grammes.
 */
export function volumetricWeightG(
  dims: { lengthMm: number | null; widthMm: number | null; heightMm: number | null },
  divisor: number,
): number | null {
  const { lengthMm: l, widthMm: w, heightMm: h } = dims;
  if (!l || !w || !h || divisor <= 0) return null;
  return Math.round((l * w * h) / divisor);
}

/** Poids facturé : le plus élevé du poids réel et du poids volumétrique. */
export function chargeableWeightG(weightG: number | null, volumetricG: number | null) {
  if (weightG == null && volumetricG == null) return null;
  return Math.max(weightG ?? 0, volumetricG ?? 0);
}

export const PARCEL_STATUSES = ['open', 'closed', 'delivered', 'lost', 'cancelled'] as const;
export type ParcelStatus = (typeof PARCEL_STATUSES)[number];
export const PARCEL_STATUS_LABELS: Record<ParcelStatus, string> = {
  open: 'Ouvert',
  closed: 'Fermé',
  delivered: 'Livré',
  lost: 'Perdu',
  cancelled: 'Annulé',
};

export const PARCEL_CONDITIONS = ['ok', 'damaged', 'opened'] as const;
export type ParcelCondition = (typeof PARCEL_CONDITIONS)[number];
export const PARCEL_CONDITION_LABELS: Record<ParcelCondition, string> = {
  ok: 'Bon état',
  damaged: 'Endommagé',
  opened: 'Ouvert / reconditionné',
};

export const CreateParcelSchema = z.object({
  locationLabel: z.string().trim().max(120).nullable().optional(),
  volumetricDivisor: z.number().int().min(1000).max(10000).default(5000),
  routeTemplateId: z.uuid().nullable().optional(),
});
export type CreateParcelInput = z.infer<typeof CreateParcelSchema>;

const measure = (max: number) => z.number().int().positive().max(max).nullable().optional();
export const UpdateParcelSchema = z.object({
  locationLabel: z.string().trim().max(120).nullable().optional(),
  weightG: measure(1_000_000),
  lengthMm: measure(5_000),
  widthMm: measure(5_000),
  heightMm: measure(5_000),
  volumetricDivisor: z.number().int().min(1000).max(10000).optional(),
  condition: z.enum(PARCEL_CONDITIONS).optional(),
  routeTemplateId: z.uuid().nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});
export type UpdateParcelInput = z.infer<typeof UpdateParcelSchema>;

export const AddParcelItemsSchema = z.object({
  items: z
    .array(z.object({ orderItemId: z.uuid(), quantity: z.number().int().min(1).max(10000) }))
    .min(1, 'Choisissez au moins un article.')
    .max(200),
});
export type AddParcelItemsInput = z.infer<typeof AddParcelItemsSchema>;

export const RemoveParcelItemSchema = z.object({
  reason: z.string().trim().min(3, 'Indiquez pourquoi l’article est retiré.').max(300),
});

export interface ParcelSummary {
  id: string;
  code: string;
  status: ParcelStatus;
  locationLabel: string | null;
  itemCount: number;
  customerCount: number;
  weightG: number | null;
  volumetricWeightG: number | null;
  currentStepCode: TrackingStepCode | null;
  shipmentId: string | null;
  createdAt: string;
}

export interface ParcelItemInfo {
  id: string;
  orderItemId: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  managedCustomer: boolean;
  description: string;
  quantity: number;
  addedAt: string;
  removedAt: string | null;
  removedReason: string | null;
}

export interface ParcelDetail extends ParcelSummary {
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  volumetricDivisor: number;
  condition: ParcelCondition;
  note: string | null;
  photoFileIds: string[];
  routeTemplateId: string | null;
  items: ParcelItemInfo[];
  events: TrackingEventInfo[];
}

/** Article reçu à l'entrepôt, pas encore (entièrement) mis en colis. */
export interface PackableItem {
  orderItemId: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  description: string;
  qtyReceived: number;
  qtyPacked: number;
}

/** Onglets de la liste des colis (espace professionnel). */
export const ORG_PARCEL_TABS = ['open', 'to_ship', 'shipped', 'done', 'all'] as const;
export type OrgParcelTab = (typeof ORG_PARCEL_TABS)[number];
export const ORG_PARCEL_TAB_LABELS: Record<OrgParcelTab, string> = {
  open: 'En préparation',
  to_ship: 'À expédier',
  shipped: 'Expédiés',
  done: 'Terminés',
  all: 'Tous',
};

export const OrgParcelPageQuerySchema = z.object({
  tab: z.enum(ORG_PARCEL_TABS).default('all'),
  q: z.string().trim().max(80).optional(),
  sort: z.enum(['created', 'weight']).default('created'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .refine((n) => [25, 50, 100].includes(n), 'Taille de page : 25, 50 ou 100.')
    .default(25),
});
export type OrgParcelPageQuery = z.infer<typeof OrgParcelPageQuerySchema>;

export interface OrgParcelRow extends ParcelSummary {
  /** Noms des clients dont des articles sont dans le colis (fiches du commissionnaire). */
  customers: string[];
}

export interface OrgParcelPage {
  items: OrgParcelRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<OrgParcelTab, number>;
}
