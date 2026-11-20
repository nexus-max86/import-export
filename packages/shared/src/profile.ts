import { z } from 'zod';
import { normalizePhone } from './phone';

export const PhoneSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const phone = normalizePhone(v);
    if (!phone) {
      ctx.addIssue({ code: 'custom', message: 'Numéro invalide. Exemple : 081 000 0000.' });
      return z.NEVER;
    }
    return phone;
  });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

export const UpdateProfileSchema = z.object({
  displayName: z.string().trim().min(2, 'Indiquez votre nom.').max(80),
  phoneWhatsapp: PhoneSchema.nullable().optional(),
  cityId: z.uuid().nullable().optional(),
  serviceZoneId: z.uuid().nullable().optional(),
  deliveryInstructions: optionalText(500),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

export const AddressSchema = z.object({
  label: z.string().trim().min(1, 'Donnez un nom à l’adresse (ex. Maison).').max(40),
  cityId: z.uuid({ message: 'Choisissez une ville.' }),
  serviceZoneId: z.uuid().nullable().optional(),
  line: z.string().trim().min(3, 'Indiquez l’avenue et le numéro.').max(200),
  landmark: optionalText(200),
  isDefault: z.boolean().optional(),
});
export type AddressInput = z.infer<typeof AddressSchema>;

export const MAX_ADDRESSES = 10;

export interface ProfileInfo {
  displayName: string;
  email: string;
  phoneWhatsapp: string | null;
  cityId: string | null;
  serviceZoneId: string | null;
  deliveryInstructions: string | null;
}

export interface AddressInfo {
  id: string;
  label: string;
  cityId: string;
  cityName: string;
  serviceZoneId: string | null;
  zoneName: string | null;
  line: string;
  landmark: string | null;
  isDefault: boolean;
}
