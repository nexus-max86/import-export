import { z } from 'zod';
import type { MarketplaceCode } from './organizations';

/** Prix lu sur la page : TOUJOURS indicatif et daté (cahier §6.3). */
export interface IndicativePrice {
  amount: number;
  currency: string;
}

export interface ProductLookup {
  status: 'ok' | 'not_supported' | 'failed';
  /** Message à afficher quand la lecture n'a pas abouti (saisie manuelle proposée). */
  message: string | null;
  url: string;
  marketplace: MarketplaceCode | null;
  title: string | null;
  imageUrl: string | null;
  price: IndicativePrice | null;
  fetchedAt: string;
}

export const LookupSchema = z.object({ url: z.string().min(1).max(4000) });
