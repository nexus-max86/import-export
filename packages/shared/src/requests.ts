import { z } from 'zod';
import { MARKETPLACE_CODES, type MarketplaceCode } from './organizations';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

export const RequestItemSchema = z
  .object({
    source: z.enum(['lookup', 'manual']),
    sourceUrl: z.url().max(2048).nullable().optional(),
    marketplace: z
      .enum(MARKETPLACE_CODES as [MarketplaceCode, ...MarketplaceCode[]])
      .nullable()
      .optional(),
    title: z.string().trim().min(2, 'Décrivez l’article.').max(300),
    variant: optionalText(200),
    size: optionalText(50),
    color: optionalText(50),
    quantity: z.number().int().min(1, 'Au moins 1.').max(10000),
    notes: optionalText(1000),
    imageUrl: z
      .url()
      .max(2048)
      .refine((u) => u.startsWith('https://'), 'Image https uniquement.')
      .nullable()
      .optional(),
    indicativePrice: z
      .object({
        amount: z.number().int().min(0).max(1_000_000_000),
        currency: z.string().regex(/^[A-Z]{3}$/),
      })
      .nullable()
      .optional(),
    priceFetchedAt: z.iso.datetime().nullable().optional(),
    screenshotFileId: z.uuid().nullable().optional(),
  })
  .refine((i) => !i.indicativePrice || i.priceFetchedAt, {
    message: 'Un prix indicatif doit être daté.',
    path: ['priceFetchedAt'],
  });
export type RequestItemInput = z.infer<typeof RequestItemSchema>;

export const UpdateRequestItemSchema = z.object({
  variant: optionalText(200),
  size: optionalText(50),
  color: optionalText(50),
  quantity: z.number().int().min(1).max(10000),
  notes: optionalText(1000),
});
export type UpdateRequestItemInput = z.infer<typeof UpdateRequestItemSchema>;

export const SendRequestSchema = z.object({
  commissioners: z
    .array(z.string().regex(/^[a-z0-9-]{1,80}$/))
    .min(1, 'Choisissez au moins un commissionnaire.')
    .max(5),
  addressId: z.uuid().nullable().optional(),
  note: optionalText(1000),
});
export type SendRequestInput = z.infer<typeof SendRequestSchema>;

export const DeclineRequestSchema = z.object({
  reason: z.string().trim().min(3, 'Indiquez un motif.').max(500),
});

export const ManagedRequestSchema = z.object({
  orgCustomerId: z.uuid(),
  items: z.array(RequestItemSchema).min(1).max(50),
  note: optionalText(1000),
});
export type ManagedRequestInput = z.infer<typeof ManagedRequestSchema>;

export type RequestStatus =
  | 'draft'
  | 'sent'
  | 'partially_quoted'
  | 'quoted'
  | 'expired'
  | 'cancelled'
  | 'converted';
export type RecipientStatusCode =
  | 'sent'
  | 'viewed'
  | 'evaluating'
  | 'quoted'
  | 'declined'
  | 'expired';

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  draft: 'Brouillon',
  sent: 'Envoyée',
  partially_quoted: 'Devis partiellement reçus',
  quoted: 'Devis reçus',
  expired: 'Expirée',
  cancelled: 'Annulée',
  converted: 'Commande passée',
};

export const RECIPIENT_STATUS_LABELS: Record<RecipientStatusCode, string> = {
  sent: 'Envoyée',
  viewed: 'Lue',
  evaluating: 'En cours d’évaluation',
  quoted: 'Devis reçu',
  declined: 'Déclinée',
  expired: 'Expirée',
};

export const MAX_ITEMS_PER_REQUEST = 50;

export interface RequestItemInfo {
  id: string;
  position: number;
  source: 'lookup' | 'manual';
  sourceUrl: string | null;
  marketplace: MarketplaceCode | null;
  title: string;
  variant: string | null;
  size: string | null;
  color: string | null;
  quantity: number;
  notes: string | null;
  imageUrl: string | null;
  indicativePrice: { amount: number; currency: string } | null;
  priceFetchedAt: string | null;
  hasScreenshot: boolean;
}

export interface RequestDetail {
  id: string;
  status: RequestStatus;
  note: string | null;
  deliveryAddress: {
    label: string;
    line: string;
    zone: string | null;
    city: string;
    landmark: string | null;
  } | null;
  sentAt: string | null;
  createdAt: string;
  items: RequestItemInfo[];
  /** Côté client : tous ses destinataires. Côté commissionnaire : uniquement sa propre ligne. */
  recipients: {
    organizationName: string;
    slug: string;
    status: RecipientStatusCode;
    declineReason: string | null;
  }[];
  /** Côté commissionnaire seulement : son devis pour cette demande, s'il existe. */
  quoteId?: string | null;
  /** Côté commissionnaire seulement : la fiche client correspondante. */
  customer?: {
    orgCustomerId: string;
    fullName: string;
    phoneWhatsapp: string | null;
    hasAccount: boolean;
  };
}

export interface RequestSummary {
  id: string;
  status: RequestStatus;
  itemCount: number;
  firstItemTitle: string | null;
  sentAt: string | null;
  createdAt: string;
  recipients: { organizationName: string; status: RecipientStatusCode }[];
}

export interface OrgRequestSummary {
  id: string;
  status: RecipientStatusCode;
  customerName: string;
  itemCount: number;
  firstItemTitle: string | null;
  sentAt: string | null;
}
