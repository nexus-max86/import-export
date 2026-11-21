import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@konzia/db';
import {
  parcelCode,
  volumetricWeightG,
  type AddParcelItemsInput,
  type CreateParcelInput,
  type PackableItem,
  type ParcelDetail,
  type ParcelSummary,
  type TrackingEventInput,
  type TrackingStepCode,
  type UpdateParcelInput,
} from '@konzia/shared';
import { randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { EVENT_SELECT, toEventInfo, TrackingService } from '../tracking/tracking.service';
import { FilesService, type UploadedBlob } from '../files/files.service';
import type { OrgContext } from '../tenancy/org-context';
import { TenantDb, type TenantTx } from '../tenancy/tenant-db.service';

const PARCEL_SELECT = {
  id: true,
  code: true,
  status: true,
  locationLabel: true,
  weightG: true,
  lengthMm: true,
  widthMm: true,
  heightMm: true,
  volumetricDivisor: true,
  volumetricWeightG: true,
  condition: true,
  note: true,
  photoFileIds: true,
  routeTemplateId: true,
  currentStepCode: true,
  createdAt: true,
  events: { select: EVENT_SELECT, orderBy: { recordedAt: 'asc' } },
  shipments: { where: { removedAt: null }, select: { shipmentId: true } },
  items: {
    select: {
      id: true,
      orderItemId: true,
      orgCustomerId: true,
      quantity: true,
      addedAt: true,
      removedAt: true,
      removedReason: true,
      orderItem: {
        select: { description: true, orderId: true, order: { select: { number: true } } },
      },
    },
    orderBy: { addedAt: 'asc' },
  },
} as const satisfies Prisma.ParcelSelect;

type ParcelRow = Prisma.ParcelGetPayload<{ select: typeof PARCEL_SELECT }>;

/**
 * Colis (ticket #20) : multi-commandes et multi-clients. Un retrait est un marquage, jamais une
 * suppression ; la base refuse de mettre en colis plus d'articles que ceux reçus.
 */
@Injectable()
export class ParcelsService {
  constructor(
    private readonly db: TenantDb,
    private readonly files: FilesService,
    private readonly audit: AuditService,
    private readonly tracking: TrackingService,
  ) {}

  async create(userId: string, org: OrgContext, input: CreateParcelInput): Promise<ParcelDetail> {
    return this.db.run(userId, async (tx) => {
      if (input.routeTemplateId) await this.tracking.assertTemplate(tx, org, input.routeTemplateId);
      // Collision très improbable (32^6 codes) : on retente quelques fois dans un point de sauvegarde.
      for (let attempt = 0; ; attempt++) {
        const code = parcelCode(randomBytes(6));
        const exists = await tx.parcel.findUnique({ where: { code }, select: { id: true } });
        if (exists) {
          if (attempt < 5) continue;
          throw new ConflictException('Création du colis impossible, réessayez.');
        }
        const p = await tx.parcel.create({
          data: {
            organizationId: org.organizationId,
            code,
            locationLabel: input.locationLabel ?? null,
            volumetricDivisor: input.volumetricDivisor,
            routeTemplateId: input.routeTemplateId ?? null,
            createdBy: userId,
          },
          select: { id: true },
        });
        await this.record(tx, org, userId, 'parcel.created', p.id, { after: { code } });
        return this.read(tx, org, p.id);
      }
    });
  }

  async update(
    userId: string,
    org: OrgContext,
    id: string,
    input: UpdateParcelInput,
  ): Promise<ParcelDetail> {
    return this.db.run(userId, async (tx) => {
      const p = await this.find(tx, org, id);
      if (p.status !== 'open' && p.status !== 'closed')
        throw new ConflictException('Ce colis est clos.');
      if (input.routeTemplateId !== undefined) {
        if (p.currentStepCode)
          throw new ConflictException('Le suivi a commencé : l’itinéraire ne change plus.');
        if (input.routeTemplateId)
          await this.tracking.assertTemplate(tx, org, input.routeTemplateId);
      }
      const next = {
        lengthMm: input.lengthMm !== undefined ? input.lengthMm : p.lengthMm,
        widthMm: input.widthMm !== undefined ? input.widthMm : p.widthMm,
        heightMm: input.heightMm !== undefined ? input.heightMm : p.heightMm,
      };
      const divisor = input.volumetricDivisor ?? p.volumetricDivisor;
      await tx.parcel.update({
        where: { id },
        data: {
          ...input,
          volumetricWeightG: volumetricWeightG(next, divisor),
        },
        select: { id: true },
      });
      await this.record(tx, org, userId, 'parcel.updated', id, {
        before: {
          weightG: p.weightG,
          ...{ lengthMm: p.lengthMm, widthMm: p.widthMm, heightMm: p.heightMm },
          condition: p.condition,
        },
        after: input,
      });
      return this.read(tx, org, id);
    });
  }

  async addItems(
    userId: string,
    org: OrgContext,
    id: string,
    input: AddParcelItemsInput,
  ): Promise<ParcelDetail> {
    return this.db.run(userId, async (tx) => {
      const p = await this.find(tx, org, id);
      if (p.status !== 'open')
        throw new ConflictException('Colis fermé : rouvrez-le pour ajouter des articles.');
      const ids = input.items.map((i) => i.orderItemId);
      if (new Set(ids).size !== ids.length)
        throw new BadRequestException('Un article apparaît deux fois.');
      const items = await tx.orderItem.findMany({
        where: { id: { in: ids }, organizationId: org.organizationId },
        select: {
          id: true,
          orderId: true,
          description: true,
          qtyReceived: true,
          customerUserId: true,
          order: { select: { status: true, orgCustomerId: true } },
          parcelItems: { where: { removedAt: null }, select: { parcelId: true, quantity: true } },
        },
      });
      if (items.length !== ids.length) throw new BadRequestException('Article introuvable.');
      const byId = new Map(items.map((i) => [i.id, i]));
      for (const want of input.items) {
        const item = byId.get(want.orderItemId)!;
        if (item.order.status === 'cancelled')
          throw new ConflictException(`« ${item.description} » : commande annulée.`);
        if (item.parcelItems.some((pi) => pi.parcelId === id))
          throw new ConflictException(
            `« ${item.description} » est déjà dans ce colis : retirez-le pour changer la quantité.`,
          );
        const free = item.qtyReceived - item.parcelItems.reduce((n, pi) => n + pi.quantity, 0);
        if (want.quantity > free)
          throw new BadRequestException(
            `« ${item.description} » : seulement ${Math.max(free, 0)} reçu(s) et pas encore en colis.`,
          );
      }
      try {
        await tx.parcelItem.createMany({
          data: input.items.map((want) => {
            const item = byId.get(want.orderItemId)!;
            return {
              parcelId: id,
              orderItemId: want.orderItemId,
              organizationId: org.organizationId,
              orgCustomerId: item.order.orgCustomerId,
              customerUserId: item.customerUserId,
              quantity: want.quantity,
              addedBy: userId,
            };
          }),
        });
      } catch (err) {
        // Ajout concurrent du même article : la base a tranché (verrou + contrôle de quantité).
        if (err instanceof Prisma.PrismaClientKnownRequestError || isDbRaise(err))
          throw new ConflictException('Articles modifiés entre-temps : rechargez la page.');
        throw err;
      }
      // Première mise en colis : la commande achetée passe « en logistique ».
      for (const orderId of new Set(items.map((i) => i.orderId))) {
        const order = await tx.order.findUniqueOrThrow({
          where: { id: orderId },
          select: { status: true },
        });
        if (order.status !== 'purchased') continue;
        await tx.order.update({
          where: { id: orderId },
          data: { status: 'in_logistics' },
          select: { id: true },
        });
        await tx.orderEvent.create({
          data: {
            orderId,
            organizationId: org.organizationId,
            type: 'status_changed',
            fromStatus: 'purchased',
            toStatus: 'in_logistics',
            actorUserId: userId,
            note: `Mis en colis (${p.code}).`,
          },
          select: { id: true },
        });
      }
      await this.record(tx, org, userId, 'parcel.items_added', id, { after: input });
      return this.read(tx, org, id);
    });
  }

  async recordEvent(
    userId: string,
    org: OrgContext,
    id: string,
    input: TrackingEventInput,
  ): Promise<ParcelDetail> {
    await this.tracking.recordParcelEvent(userId, org, id, input);
    return this.get(userId, org, id);
  }

  async removeItem(
    userId: string,
    org: OrgContext,
    id: string,
    parcelItemId: string,
    reason: string,
  ): Promise<ParcelDetail> {
    return this.db.run(userId, async (tx) => {
      const p = await this.find(tx, org, id);
      if (p.status !== 'open')
        throw new ConflictException('Colis fermé : rouvrez-le pour retirer un article.');
      const item = await tx.parcelItem.findFirst({
        where: { id: parcelItemId, parcelId: id, removedAt: null },
        select: { orderItemId: true, quantity: true },
      });
      if (!item) throw new NotFoundException('Article absent de ce colis.');
      await tx.parcelItem.update({
        where: { id: parcelItemId },
        data: { removedAt: new Date(), removedBy: userId, removedReason: reason },
        select: { id: true },
      });
      await this.record(tx, org, userId, 'parcel.item_removed', id, {
        before: item,
        reason,
      });
      return this.read(tx, org, id);
    });
  }

  async setStatus(
    userId: string,
    org: OrgContext,
    id: string,
    to: 'open' | 'closed' | 'cancelled',
  ): Promise<ParcelDetail> {
    return this.db.run(userId, async (tx) => {
      const p = await this.find(tx, org, id);
      const active = await tx.parcelItem.count({ where: { parcelId: id, removedAt: null } });
      const allowed =
        (p.status === 'open' && to === 'closed') ||
        (p.status === 'closed' && to === 'open') ||
        (p.status === 'open' && to === 'cancelled');
      if (!allowed) throw new ConflictException('Changement d’état impossible pour ce colis.');
      if (to === 'closed' && active === 0)
        throw new ConflictException('Un colis vide ne peut pas être fermé.');
      if (to === 'closed' && !p.weightG)
        throw new ConflictException('Pesez le colis avant de le fermer.');
      if (to === 'cancelled' && active > 0)
        throw new ConflictException('Retirez d’abord les articles du colis.');
      await tx.parcel.update({ where: { id }, data: { status: to }, select: { id: true } });
      await this.record(tx, org, userId, `parcel.${to === 'open' ? 'reopened' : to}`, id, {
        before: { status: p.status },
        after: { status: to },
      });
      return this.read(tx, org, id);
    });
  }

  async addPhoto(
    userId: string,
    org: OrgContext,
    id: string,
    upload: UploadedBlob,
  ): Promise<ParcelDetail> {
    return this.db.run(userId, async (tx) => {
      const p = await this.find(tx, org, id);
      if (p.photoFileIds.length >= 10)
        throw new BadRequestException('10 photos maximum par colis.');
      const stored = await this.files.store(tx, userId, org.organizationId, 'parcel_photo', upload);
      await tx.parcel.update({
        where: { id },
        data: { photoFileIds: { push: stored.id } },
        select: { id: true },
      });
      await this.record(tx, org, userId, 'parcel.photo_added', id, {
        after: { fileId: stored.id },
      });
      return this.read(tx, org, id);
    });
  }

  async photo(userId: string, org: OrgContext, id: string, fileId: string) {
    const file = await this.db.run(userId, async (tx) => {
      const p = await this.find(tx, org, id);
      if (!p.photoFileIds.includes(fileId)) return null;
      return tx.storedFile.findFirst({
        where: { id: fileId, purpose: 'parcel_photo' },
        select: { storageKey: true, mime: true, originalName: true },
      });
    });
    if (!file) throw new NotFoundException('Photo introuvable.');
    return { ...file, content: await this.files.read(file.storageKey) };
  }

  list(userId: string, org: OrgContext): Promise<ParcelSummary[]> {
    return this.db.run(userId, async (tx) => {
      const rows = await tx.parcel.findMany({
        where: { organizationId: org.organizationId },
        select: PARCEL_SELECT,
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      return rows.map((r) => summary(r));
    });
  }

  get(userId: string, org: OrgContext, id: string): Promise<ParcelDetail> {
    return this.db.run(userId, (tx) => this.read(tx, org, id));
  }

  /** Articles reçus à l'entrepôt qui ne sont pas encore (entièrement) en colis. */
  packable(userId: string, org: OrgContext): Promise<PackableItem[]> {
    return this.db.run(userId, async (tx) => {
      const items = await tx.orderItem.findMany({
        where: {
          organizationId: org.organizationId,
          qtyReceived: { gt: 0 },
          order: { status: { not: 'cancelled' } },
        },
        select: {
          id: true,
          orderId: true,
          description: true,
          qtyReceived: true,
          order: { select: { number: true, orgCustomerId: true } },
          parcelItems: { where: { removedAt: null }, select: { quantity: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: 500,
      });
      const names = await this.customerNames(
        tx,
        items.map((i) => i.order.orgCustomerId),
      );
      return items
        .map((i) => ({
          orderItemId: i.id,
          orderId: i.orderId,
          orderNumber: i.order.number,
          customerName: names.get(i.order.orgCustomerId)?.name ?? '',
          description: i.description,
          qtyReceived: i.qtyReceived,
          qtyPacked: i.parcelItems.reduce((n, p) => n + p.quantity, 0),
        }))
        .filter((i) => i.qtyPacked < i.qtyReceived);
    });
  }

  private async customerNames(tx: TenantTx, ids: string[]) {
    const rows = await tx.orgCustomer.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, fullName: true, userId: true },
    });
    return new Map(rows.map((c) => [c.id, { name: c.fullName, managed: c.userId === null }]));
  }

  private async find(tx: TenantTx, org: OrgContext, id: string) {
    const p = await tx.parcel.findFirst({
      where: { id, organizationId: org.organizationId },
      select: {
        code: true,
        status: true,
        weightG: true,
        lengthMm: true,
        widthMm: true,
        heightMm: true,
        volumetricDivisor: true,
        condition: true,
        photoFileIds: true,
        currentStepCode: true,
      },
    });
    if (!p) throw new NotFoundException('Colis introuvable.');
    return p;
  }

  private async read(tx: TenantTx, org: OrgContext, id: string): Promise<ParcelDetail> {
    const p = await tx.parcel.findFirst({
      where: { id, organizationId: org.organizationId },
      select: PARCEL_SELECT,
    });
    if (!p) throw new NotFoundException('Colis introuvable.');
    const names = await this.customerNames(
      tx,
      p.items.map((i) => i.orgCustomerId),
    );
    const labels = new Map(
      (await this.tracking.templateSteps(tx, p.routeTemplateId)).map((st) => [st.code, st.labelFr]),
    );
    return {
      ...summary(p),
      lengthMm: p.lengthMm,
      widthMm: p.widthMm,
      heightMm: p.heightMm,
      volumetricDivisor: p.volumetricDivisor,
      condition: p.condition,
      note: p.note,
      photoFileIds: p.photoFileIds,
      routeTemplateId: p.routeTemplateId,
      events: p.events.map((e) => toEventInfo(e, labels)),
      items: p.items.map((i) => ({
        id: i.id,
        orderItemId: i.orderItemId,
        orderId: i.orderItem.orderId,
        orderNumber: i.orderItem.order.number,
        customerName: names.get(i.orgCustomerId)?.name ?? '',
        managedCustomer: names.get(i.orgCustomerId)?.managed ?? false,
        description: i.orderItem.description,
        quantity: i.quantity,
        addedAt: i.addedAt.toISOString(),
        removedAt: i.removedAt?.toISOString() ?? null,
        removedReason: i.removedReason,
      })),
    };
  }

  private record(
    tx: TenantTx,
    org: OrgContext,
    userId: string,
    action: string,
    parcelId: string,
    data: { before?: unknown; after?: unknown; reason?: string },
  ) {
    return this.audit.record(tx, {
      actorUserId: userId,
      actorRole: org.role,
      organizationId: org.organizationId,
      action,
      entityType: 'parcel',
      entityId: parcelId,
      before: data.before as Prisma.InputJsonValue | undefined,
      after: data.after as Prisma.InputJsonValue | undefined,
      reason: data.reason ?? null,
    });
  }
}

function summary(p: ParcelRow): ParcelSummary {
  const active = p.items.filter((i) => i.removedAt === null);
  return {
    id: p.id,
    code: p.code,
    status: p.status,
    locationLabel: p.locationLabel,
    itemCount: active.reduce((n, i) => n + i.quantity, 0),
    customerCount: new Set(active.map((i) => i.orgCustomerId)).size,
    weightG: p.weightG,
    volumetricWeightG: p.volumetricWeightG,
    currentStepCode: p.currentStepCode as TrackingStepCode | null,
    shipmentId: p.shipments[0]?.shipmentId ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}

function isDbRaise(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientUnknownRequestError;
}
