import { z } from 'zod';

export const HANDOVER_MODES = ['pickup', 'delivery', 'partner_point'] as const;
export type HandoverMode = (typeof HANDOVER_MODES)[number];

export const HANDOVER_LABELS: Record<HandoverMode, string> = {
  pickup: 'Retrait',
  delivery: 'Livraison',
  partner_point: 'Point partenaire',
};

const placeName = z.string().trim().min(2, 'Nom trop court.').max(60);

export const CreateCitySchema = z.object({ name: placeName });
export const UpdateCitySchema = z.object({
  name: placeName.optional(),
  isActive: z.boolean().optional(),
});
export const CreateZoneSchema = z.object({ name: placeName });
export const UpdateZoneSchema = z.object({
  name: placeName.optional(),
  isActive: z.boolean().optional(),
});

/** Montant en unité mineure (centimes). Entier positif, jamais de flottant. */
export const MinorAmountSchema = z
  .number()
  .int('Montant en centimes entiers.')
  .min(0)
  .max(1_000_000_000);

export const OrgServiceZonesSchema = z.object({
  zones: z
    .array(
      z.object({
        serviceZoneId: z.uuid(),
        handoverModes: z
          .array(z.enum(HANDOVER_MODES))
          .min(1, 'Choisissez au moins un mode de remise.'),
        localFee: z
          .object({ amount: MinorAmountSchema, currency: z.enum(['USD', 'CDF']) })
          .nullable(),
      }),
    )
    .max(200)
    .refine((zs) => new Set(zs.map((z) => z.serviceZoneId)).size === zs.length, 'Zone en double.'),
});
export type OrgServiceZonesInput = z.infer<typeof OrgServiceZonesSchema>;

export interface ZoneInfo {
  id: string;
  name: string;
  isActive: boolean;
}

export interface CityInfo {
  id: string;
  name: string;
  isActive: boolean;
  zones: ZoneInfo[];
}

export interface OrgServiceZoneInfo {
  serviceZoneId: string;
  zoneName: string;
  cityName: string;
  handoverModes: HandoverMode[];
  localFee: { amount: number; currency: 'USD' | 'CDF' } | null;
}
