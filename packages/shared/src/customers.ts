import { z } from 'zod';
import { PhoneSchema } from './profile';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

export const OrgCustomerSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Indiquez le nom du client.').max(100),
    phoneWhatsapp: PhoneSchema.nullable().optional(),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .transform((v) => (v === '' ? null : v))
      .pipe(z.email({ message: 'Adresse e-mail invalide.' }).nullable())
      .nullable()
      .optional(),
    cityId: z.uuid().nullable().optional(),
    serviceZoneId: z.uuid().nullable().optional(),
    addressLine: optionalText(200),
    landmark: optionalText(200),
    notesPrivate: optionalText(1000),
  })
  .refine((c) => c.phoneWhatsapp || c.email, {
    message: 'Indiquez au moins un numéro WhatsApp ou une adresse e-mail.',
    path: ['phoneWhatsapp'],
  });
export type OrgCustomerInput = z.infer<typeof OrgCustomerSchema>;

export interface OrgCustomerInfo {
  id: string;
  fullName: string;
  phoneWhatsapp: string | null;
  email: string | null;
  cityId: string | null;
  cityName: string | null;
  serviceZoneId: string | null;
  zoneName: string | null;
  addressLine: string | null;
  landmark: string | null;
  notesPrivate: string | null;
  source: 'signup' | 'manual' | 'import';
  /** Vrai si le client a un compte Konzia (inscrit ou fiche réclamée). */
  hasAccount: boolean;
  createdAt: string;
}

export interface ClaimLink {
  link: string;
  expiresAt: string;
  /** Lien wa.me prérempli, si la fiche a un numéro WhatsApp. */
  whatsapp: string | null;
}

export interface ClaimResult {
  organizationName: string;
  merged: boolean;
}
