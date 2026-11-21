import { z } from 'zod';
import type { OrderStatus } from './orders';

/**
 * Catalogue des 19 étapes du cahier (§5.4). Les quatre premières relèvent des achats
 * fournisseurs ; les suivantes, des colis ; « anomaly » peut survenir à tout moment.
 */
export const TRACKING_STEPS = [
  { code: 'awaiting_purchase', label: 'En attente d’achat', stage: 'purchase' },
  { code: 'purchased', label: 'Acheté', stage: 'purchase' },
  { code: 'awaiting_seller_shipment', label: 'En attente d’expédition vendeur', stage: 'purchase' },
  { code: 'shipped_by_seller', label: 'Expédié par le vendeur', stage: 'purchase' },
  { code: 'received_origin_warehouse', label: 'Reçu à l’entrepôt d’origine', stage: 'parcel' },
  { code: 'checked', label: 'Contrôlé', stage: 'parcel' },
  { code: 'weighed', label: 'Pesé et mesuré', stage: 'parcel' },
  { code: 'consolidated', label: 'Regroupé ou reconditionné', stage: 'parcel' },
  { code: 'ready_international', label: 'Prêt à l’expédition internationale', stage: 'parcel' },
  { code: 'shipped_to_drc', label: 'Expédié vers la RDC', stage: 'parcel' },
  { code: 'in_transit', label: 'En transit', stage: 'parcel' },
  { code: 'arrived_drc', label: 'Arrivé en RDC', stage: 'parcel' },
  { code: 'customs', label: 'En formalités douanières', stage: 'parcel' },
  { code: 'released', label: 'Libéré', stage: 'parcel' },
  { code: 'at_distribution_point', label: 'Arrivé au point de distribution', stage: 'parcel' },
  { code: 'ready_for_handover', label: 'Prêt pour retrait ou livraison', stage: 'parcel' },
  { code: 'out_for_delivery', label: 'En cours de livraison locale', stage: 'parcel' },
  { code: 'delivered', label: 'Livré', stage: 'parcel' },
  { code: 'anomaly', label: 'Anomalie', stage: 'anomaly' },
] as const;

export type TrackingStepCode = (typeof TRACKING_STEPS)[number]['code'];
export const PARCEL_STEP_CODES = TRACKING_STEPS.filter((s) => s.stage === 'parcel').map(
  (s) => s.code,
) as TrackingStepCode[];
export const STEP_LABELS = Object.fromEntries(
  TRACKING_STEPS.map((s) => [s.code, s.label]),
) as Record<TrackingStepCode, string>;

export const ANOMALY_TYPES = ['blocked', 'lost', 'damaged'] as const;
export type AnomalyType = (typeof ANOMALY_TYPES)[number];
export const ANOMALY_LABELS: Record<AnomalyType, string> = {
  blocked: 'Bloqué',
  lost: 'Perdu',
  damaged: 'Endommagé',
};

export const SHIPMENT_MODES = ['air', 'sea', 'road', 'mixed', 'other'] as const;
export type ShipmentMode = (typeof SHIPMENT_MODES)[number];
export const SHIPMENT_MODE_LABELS: Record<ShipmentMode, string> = {
  air: 'Avion',
  sea: 'Bateau',
  road: 'Route',
  mixed: 'Bateau puis route',
  other: 'Autre (transitaire)',
};

export type ShipmentStatus = 'planned' | 'in_transit' | 'arrived' | 'cancelled';
export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  planned: 'En préparation',
  in_transit: 'En route',
  arrived: 'Arrivée',
  cancelled: 'Annulée',
};

/**
 * Statut de commande correspondant à une étape de colis. La commande suit le colis le moins
 * avancé (docs/05, §4).
 */
export function orderStatusForStep(code: string | null): OrderStatus {
  switch (code) {
    case 'shipped_to_drc':
    case 'in_transit':
    case 'arrived_drc':
    case 'customs':
    case 'released':
      return 'in_transit';
    case 'at_distribution_point':
      return 'at_distribution_point';
    case 'ready_for_handover':
    case 'out_for_delivery':
      return 'ready_for_handover';
    case 'delivered':
      return 'completed';
    default:
      return 'in_logistics';
  }
}

/** Ordre de la progression logistique d'une commande (après l'achat). */
export const LOGISTICS_ORDER_STATUSES: OrderStatus[] = [
  'in_logistics',
  'in_transit',
  'at_distribution_point',
  'ready_for_handover',
  'completed',
];

const step = z.enum(TRACKING_STEPS.map((s) => s.code) as [TrackingStepCode, ...TrackingStepCode[]]);

export const RouteTemplateSchema = z.object({
  name: z.string().trim().min(2, 'Nommez l’itinéraire.').max(80),
  mode: z.enum(SHIPMENT_MODES).nullable().optional(),
  steps: z
    .array(
      z.object({
        code: step.refine((c) => PARCEL_STEP_CODES.includes(c), 'Étape de colis attendue.'),
        label: z.string().trim().min(2).max(80).optional(),
        visibleToCustomer: z.boolean().default(true),
      }),
    )
    .min(2, 'Au moins deux étapes.')
    .max(PARCEL_STEP_CODES.length)
    .refine((s) => new Set(s.map((x) => x.code)).size === s.length, 'Étape en double.')
    .refine((s) => s.at(-1)?.code === 'delivered', 'L’itinéraire se termine par « Livré ».'),
});
export type RouteTemplateInput = z.infer<typeof RouteTemplateSchema>;

const eventBase = {
  occurredAt: z.iso.datetime().optional(),
  location: z.string().trim().max(120).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
};
export const TrackingEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('step'), stepCode: step, ...eventBase }),
  z.object({
    kind: z.literal('anomaly'),
    anomalyType: z.enum(ANOMALY_TYPES),
    ...eventBase,
    note: z.string().trim().min(3, 'Décrivez l’anomalie.').max(1000),
  }),
  z.object({
    kind: z.literal('correction'),
    stepCode: step,
    ...eventBase,
    note: z.string().trim().min(3, 'Expliquez la correction.').max(1000),
  }),
]);
export type TrackingEventInput = z.infer<typeof TrackingEventSchema>;

export interface RouteTemplateInfo {
  id: string;
  name: string;
  mode: ShipmentMode | null;
  global: boolean;
  steps: { code: TrackingStepCode; label: string; visibleToCustomer: boolean }[];
}

export interface TrackingEventInfo {
  id: string;
  kind: 'step' | 'anomaly' | 'correction';
  stepCode: TrackingStepCode;
  label: string;
  anomalyType: AnomalyType | null;
  occurredAt: string;
  recordedAt: string;
  location: string | null;
  note: string | null;
  visibleToCustomer: boolean;
  viaShipment: boolean;
}

const optionalDate = z.iso.datetime().nullable().optional();
export const ShipmentSchema = z.object({
  mode: z.enum(SHIPMENT_MODES),
  origin: z.string().trim().min(2, 'Indiquez l’origine.').max(120),
  destination: z.string().trim().min(2, 'Indiquez la destination.').max(120),
  carrier: z.string().trim().max(120).nullable().optional(),
  reference: z.string().trim().max(120).nullable().optional(),
  trackingNumber: z.string().trim().max(120).nullable().optional(),
  departureEst: optionalDate,
  departureAt: optionalDate,
  arrivalEst: optionalDate,
  arrivalAt: optionalDate,
  costAmount: z.number().int().min(0).max(10_000_000_000).nullable().optional(),
  currency: z.enum(['USD', 'CNY', 'CDF']).nullable().optional(),
});
export type ShipmentInput = z.infer<typeof ShipmentSchema>;
export const UpdateShipmentSchema = ShipmentSchema.partial();

export interface ShipmentInfo {
  id: string;
  mode: ShipmentMode;
  origin: string;
  destination: string;
  carrier: string | null;
  reference: string | null;
  trackingNumber: string | null;
  departureEst: string | null;
  departureAt: string | null;
  arrivalEst: string | null;
  arrivalAt: string | null;
  costAmount: number | null;
  currency: string | null;
  status: ShipmentStatus;
  parcels: { id: string; code: string; currentStepCode: TrackingStepCode | null }[];
  events: TrackingEventInfo[];
  createdAt: string;
}

/** Suivi d'un colis vu par le client : ses articles seulement, étapes visibles, sans notes. */
export interface CustomerParcelTracking {
  parcelCode: string;
  status: 'open' | 'closed' | 'delivered' | 'lost';
  currentLabel: string | null;
  items: { orderNumber: string; description: string; quantity: number }[];
  events: {
    kind: 'step' | 'anomaly' | 'correction';
    label: string;
    occurredAt: string;
    location: string | null;
  }[];
}
