import type { HandoverMode } from './geo';
import type { MarketplaceCode, TransportMode } from './organizations';

/** Fiche publique d'un commissionnaire vérifié (aucune donnée interne). */
export interface PublicCommissioner {
  slug: string;
  name: string;
  type: 'independent' | 'company';
  description: string | null;
  phoneWhatsapp: string | null;
  marketplaces: MarketplaceCode[];
  transportModes: TransportMode[];
  pricingPolicy: string | null;
  isPlatformOperated: boolean;
  /** Vérifié depuis moins de 60 jours. */
  isNew: boolean;
  zones: { cityName: string; zoneName: string; handoverModes: HandoverMode[] }[];
}
