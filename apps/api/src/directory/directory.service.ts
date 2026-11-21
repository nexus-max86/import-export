import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@konzia/db';
import type { MarketplaceCode, PublicCommissioner, TransportMode } from '@konzia/shared';
import { TenantDb } from '../tenancy/tenant-db.service';

const NEW_FOR_MS = 60 * 86_400_000;

const SELECT = {
  slug: true,
  name: true,
  type: true,
  description: true,
  phoneWhatsapp: true,
  marketplaces: true,
  transportModes: true,
  pricingPolicy: true,
  isPlatformOperated: true,
  verifiedAt: true,
  serviceZones: {
    select: {
      handoverModes: true,
      serviceZone: { select: { name: true, city: { select: { name: true } } } },
    },
  },
} as const;

type Row = Prisma.OrganizationGetPayload<{ select: typeof SELECT }>;

function toPublic(r: Row): PublicCommissioner {
  const approvedAt = r.verifiedAt;
  return {
    slug: r.slug,
    name: r.name,
    type: r.type,
    description: r.description,
    phoneWhatsapp: r.phoneWhatsapp,
    marketplaces: r.marketplaces as MarketplaceCode[],
    transportModes: r.transportModes as TransportMode[],
    pricingPolicy: r.pricingPolicy,
    isPlatformOperated: r.isPlatformOperated,
    isNew: !approvedAt || Date.now() - approvedAt.getTime() < NEW_FOR_MS,
    zones: r.serviceZones
      .map((z) => ({
        cityName: z.serviceZone.city.name,
        zoneName: z.serviceZone.name,
        handoverModes: z.handoverModes,
      }))
      .sort(
        (a, b) =>
          a.cityName.localeCompare(b.cityName, 'fr') || a.zoneName.localeCompare(b.zoneName, 'fr'),
      ),
  };
}

@Injectable()
export class DirectoryService {
  constructor(private readonly db: TenantDb) {}

  /** Annuaire : commissionnaires approuvés, filtrables par ville et par site d'achat. */
  list(filters: { cityId?: string; marketplace?: string }): Promise<PublicCommissioner[]> {
    return this.db.runAnonymous(async (tx) => {
      const rows = await tx.organization.findMany({
        where: {
          status: 'approved',
          ...(filters.marketplace ? { marketplaces: { has: filters.marketplace } } : {}),
          ...(filters.cityId
            ? { serviceZones: { some: { serviceZone: { cityId: filters.cityId } } } }
            : {}),
        },
        select: SELECT,
        orderBy: { name: 'asc' },
        take: 200,
      });
      return rows.map(toPublic);
    });
  }

  get(slug: string): Promise<PublicCommissioner> {
    return this.db.runAnonymous(async (tx) => {
      const row = await tx.organization.findFirst({
        where: { slug, status: 'approved' },
        select: SELECT,
      });
      if (!row) throw new NotFoundException('Commissionnaire introuvable.');
      return toPublic(row);
    });
  }
}
