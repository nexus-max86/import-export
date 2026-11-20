import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@konzia/db';
import type { CityInfo, OrgServiceZoneInfo, OrgServiceZonesInput } from '@konzia/shared';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { OrgContext } from '../tenancy/org-context';
import { TenantDb } from '../tenancy/tenant-db.service';

const CITY_SELECT = {
  id: true,
  name: true,
  isActive: true,
  zones: { select: { id: true, name: true, isActive: true }, orderBy: { name: 'asc' } },
} as const;

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

@Injectable()
export class GeoService {
  constructor(
    private readonly system: PrismaService,
    private readonly db: TenantDb,
    private readonly audit: AuditService,
  ) {}

  /** Villes ouvertes et leurs zones actives (public). */
  async activeCities(): Promise<CityInfo[]> {
    return this.system.city.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { ...CITY_SELECT, zones: { ...CITY_SELECT.zones, where: { isActive: true } } },
    });
  }

  // --- Administration (chemin système, audité) -------------------------------

  allCities(): Promise<CityInfo[]> {
    return this.system.city.findMany({ orderBy: { name: 'asc' }, select: CITY_SELECT });
  }

  async createCity(adminId: string, name: string): Promise<CityInfo> {
    try {
      return await this.system.$transaction(async (tx) => {
        const city = await tx.city.create({ data: { name }, select: CITY_SELECT });
        await this.audit.recordSystem(
          {
            actorUserId: adminId,
            actorRole: 'platform_admin',
            action: 'geo.city.created',
            entityType: 'city',
            entityId: city.id,
            after: { name, isActive: false },
          },
          tx,
        );
        return city;
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('Cette ville existe déjà.');
      throw err;
    }
  }

  async updateCity(
    adminId: string,
    id: string,
    data: { name?: string; isActive?: boolean },
  ): Promise<CityInfo> {
    return this.system.$transaction(async (tx) => {
      const before = await tx.city.findUnique({
        where: { id },
        select: { name: true, isActive: true },
      });
      if (!before) throw new NotFoundException('Ville introuvable.');
      const city = await tx.city.update({ where: { id }, data, select: CITY_SELECT });
      await this.audit.recordSystem(
        {
          actorUserId: adminId,
          actorRole: 'platform_admin',
          action: 'geo.city.updated',
          entityType: 'city',
          entityId: id,
          before,
          after: { name: city.name, isActive: city.isActive },
        },
        tx,
      );
      return city;
    });
  }

  async createZone(adminId: string, cityId: string, name: string): Promise<void> {
    try {
      await this.system.$transaction(async (tx) => {
        const city = await tx.city.findUnique({ where: { id: cityId }, select: { id: true } });
        if (!city) throw new NotFoundException('Ville introuvable.');
        const zone = await tx.serviceZone.create({ data: { cityId, name }, select: { id: true } });
        await this.audit.recordSystem(
          {
            actorUserId: adminId,
            actorRole: 'platform_admin',
            action: 'geo.zone.created',
            entityType: 'service_zone',
            entityId: zone.id,
            after: { cityId, name },
          },
          tx,
        );
      });
    } catch (err) {
      if (isUniqueViolation(err))
        throw new ConflictException('Cette zone existe déjà dans la ville.');
      throw err;
    }
  }

  async updateZone(
    adminId: string,
    id: string,
    data: { name?: string; isActive?: boolean },
  ): Promise<void> {
    await this.system.$transaction(async (tx) => {
      const before = await tx.serviceZone.findUnique({
        where: { id },
        select: { name: true, isActive: true },
      });
      if (!before) throw new NotFoundException('Zone introuvable.');
      const after = await tx.serviceZone.update({
        where: { id },
        data,
        select: { name: true, isActive: true },
      });
      await this.audit.recordSystem(
        {
          actorUserId: adminId,
          actorRole: 'platform_admin',
          action: 'geo.zone.updated',
          entityType: 'service_zone',
          entityId: id,
          before,
          after,
        },
        tx,
      );
    });
  }

  // --- Zones desservies par un commissionnaire (rôle applicatif, RLS) -----------

  orgZones(userId: string, org: OrgContext): Promise<OrgServiceZoneInfo[]> {
    return this.db.run(userId, (tx) => this.readOrgZones(tx, org.organizationId));
  }

  /** Remplace la liste complète des zones desservies (un formulaire = un état). */
  async setOrgZones(
    userId: string,
    org: OrgContext,
    input: OrgServiceZonesInput,
  ): Promise<OrgServiceZoneInfo[]> {
    return this.db.run(userId, async (tx) => {
      const ids = input.zones.map((z) => z.serviceZoneId);
      const valid = await tx.serviceZone.count({
        where: { id: { in: ids }, isActive: true, city: { isActive: true } },
      });
      if (valid !== ids.length)
        throw new NotFoundException('Une des zones choisies n’est pas ouverte.');

      const before = await this.readOrgZones(tx, org.organizationId);
      await tx.organizationServiceZone.deleteMany({
        where: { organizationId: org.organizationId },
      });
      if (input.zones.length > 0) {
        await tx.organizationServiceZone.createMany({
          data: input.zones.map((z) => ({
            organizationId: org.organizationId,
            serviceZoneId: z.serviceZoneId,
            handoverModes: z.handoverModes,
            localFeeAmount: z.localFee ? BigInt(z.localFee.amount) : null,
            localFeeCurrency: z.localFee?.currency ?? null,
          })),
        });
      }
      const after = await this.readOrgZones(tx, org.organizationId);
      await this.audit.record(tx, {
        actorUserId: userId,
        actorRole: org.role,
        organizationId: org.organizationId,
        action: 'org.service_zones.updated',
        entityType: 'organization',
        entityId: org.organizationId,
        before: before as unknown as Prisma.InputJsonValue,
        after: after as unknown as Prisma.InputJsonValue,
      });
      return after;
    });
  }

  private async readOrgZones(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<OrgServiceZoneInfo[]> {
    const rows = await tx.organizationServiceZone.findMany({
      where: { organizationId },
      select: {
        serviceZoneId: true,
        handoverModes: true,
        localFeeAmount: true,
        localFeeCurrency: true,
        serviceZone: { select: { name: true, city: { select: { name: true } } } },
      },
      orderBy: [{ serviceZone: { city: { name: 'asc' } } }, { serviceZone: { name: 'asc' } }],
    });
    return rows.map((r) => ({
      serviceZoneId: r.serviceZoneId,
      zoneName: r.serviceZone.name,
      cityName: r.serviceZone.city.name,
      handoverModes: r.handoverModes,
      localFee:
        r.localFeeAmount !== null && r.localFeeCurrency
          ? { amount: Number(r.localFeeAmount), currency: r.localFeeCurrency as 'USD' | 'CDF' }
          : null,
    }));
  }
}
