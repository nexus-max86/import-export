import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MAX_ADDRESSES,
  type AddressInfo,
  type AddressInput,
  type ProfileInfo,
  type UpdateProfileInput,
} from '@konzia/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TenantDb, type TenantTx } from '../tenancy/tenant-db.service';

const ADDRESS_SELECT = {
  id: true,
  label: true,
  cityId: true,
  serviceZoneId: true,
  line: true,
  landmark: true,
  isDefault: true,
  city: { select: { name: true } },
  serviceZone: { select: { name: true } },
} as const;

type AddressRow = {
  id: string;
  label: string;
  cityId: string;
  serviceZoneId: string | null;
  line: string;
  landmark: string | null;
  isDefault: boolean;
  city: { name: string };
  serviceZone: { name: string } | null;
};

function toInfo(a: AddressRow): AddressInfo {
  return {
    id: a.id,
    label: a.label,
    cityId: a.cityId,
    cityName: a.city.name,
    serviceZoneId: a.serviceZoneId,
    zoneName: a.serviceZone?.name ?? null,
    line: a.line,
    landmark: a.landmark,
    isDefault: a.isDefault,
  };
}

@Injectable()
export class ProfileService {
  constructor(
    /** Nom et téléphone vivent dans `users` (identité) : mis à jour pour soi-même uniquement. */
    private readonly system: PrismaService,
    private readonly db: TenantDb,
  ) {}

  async get(userId: string): Promise<ProfileInfo> {
    const user = await this.system.user.findUniqueOrThrow({
      where: { id: userId },
      select: { displayName: true, email: true, phoneWhatsapp: true },
    });
    const profile = await this.db.run(userId, (tx) =>
      tx.customerProfile.findUnique({
        where: { userId },
        select: { cityId: true, serviceZoneId: true, deliveryInstructions: true },
      }),
    );
    return {
      ...user,
      cityId: profile?.cityId ?? null,
      serviceZoneId: profile?.serviceZoneId ?? null,
      deliveryInstructions: profile?.deliveryInstructions ?? null,
    };
  }

  async update(userId: string, input: UpdateProfileInput): Promise<ProfileInfo> {
    await this.db.run(userId, async (tx) => {
      await this.assertPlace(tx, input.cityId ?? null, input.serviceZoneId ?? null);
      const data = {
        cityId: input.cityId ?? null,
        serviceZoneId: input.serviceZoneId ?? null,
        deliveryInstructions: input.deliveryInstructions ?? null,
      };
      await tx.customerProfile.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
        select: { userId: true },
      });
    });
    await this.system.user.update({
      where: { id: userId },
      data: { displayName: input.displayName, phoneWhatsapp: input.phoneWhatsapp ?? null },
    });
    return this.get(userId);
  }

  listAddresses(userId: string): Promise<AddressInfo[]> {
    return this.db.run(userId, async (tx) => {
      const rows = await tx.address.findMany({
        where: { userId },
        select: ADDRESS_SELECT,
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      });
      return rows.map(toInfo);
    });
  }

  createAddress(userId: string, input: AddressInput): Promise<AddressInfo> {
    return this.db.run(userId, async (tx) => {
      await this.assertPlace(tx, input.cityId, input.serviceZoneId ?? null);
      const count = await tx.address.count({ where: { userId } });
      if (count >= MAX_ADDRESSES) {
        throw new ConflictException(
          `Vous avez déjà ${MAX_ADDRESSES} adresses. Supprimez-en une d’abord.`,
        );
      }
      const isDefault = count === 0 || input.isDefault === true;
      if (isDefault)
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      const row = await tx.address.create({
        data: {
          userId,
          label: input.label,
          cityId: input.cityId,
          serviceZoneId: input.serviceZoneId ?? null,
          line: input.line,
          landmark: input.landmark ?? null,
          isDefault,
        },
        select: ADDRESS_SELECT,
      });
      return toInfo(row);
    });
  }

  updateAddress(userId: string, id: string, input: AddressInput): Promise<AddressInfo> {
    return this.db.run(userId, async (tx) => {
      const current = await tx.address.findFirst({
        where: { id, userId },
        select: { isDefault: true },
      });
      if (!current) throw new NotFoundException('Adresse introuvable.');
      await this.assertPlace(tx, input.cityId, input.serviceZoneId ?? null);
      if (input.isDefault === true && !current.isDefault) {
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }
      const row = await tx.address.update({
        where: { id },
        data: {
          label: input.label,
          cityId: input.cityId,
          serviceZoneId: input.serviceZoneId ?? null,
          line: input.line,
          landmark: input.landmark ?? null,
          // On ne retire pas le statut « par défaut » sans en désigner une autre.
          isDefault: current.isDefault || input.isDefault === true,
        },
        select: ADDRESS_SELECT,
      });
      return toInfo(row);
    });
  }

  /** Suppression réelle : les demandes de devis gardent une copie de l'adresse au moment de l'envoi. */
  async deleteAddress(userId: string, id: string): Promise<void> {
    await this.db.run(userId, async (tx) => {
      const address = await tx.address.findFirst({
        where: { id, userId },
        select: { isDefault: true },
      });
      if (!address) throw new NotFoundException('Adresse introuvable.');
      await tx.address.delete({ where: { id }, select: { id: true } });
      if (address.isDefault) {
        const next = await tx.address.findFirst({
          where: { userId },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        if (next)
          await tx.address.update({
            where: { id: next.id },
            data: { isDefault: true },
            select: { id: true },
          });
      }
    });
  }

  /** La ville doit être ouverte et la zone (facultative) doit lui appartenir. */
  private async assertPlace(
    tx: TenantTx,
    cityId: string | null,
    zoneId: string | null,
  ): Promise<void> {
    if (zoneId && !cityId) throw new BadRequestException('Choisissez la ville de cette zone.');
    if (!cityId) return;
    const city = await tx.city.findFirst({
      where: { id: cityId, isActive: true },
      select: { id: true },
    });
    if (!city) throw new BadRequestException('Konzia n’est pas encore ouvert dans cette ville.');
    if (zoneId) {
      const zone = await tx.serviceZone.findFirst({
        where: { id: zoneId, cityId, isActive: true },
        select: { id: true },
      });
      if (!zone)
        throw new BadRequestException('Cette commune ne fait pas partie de la ville choisie.');
    }
  }
}
