import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@konzia/db';
import {
  STEP_LABELS,
  type ShipmentInfo,
  type ShipmentInput,
  type ShipmentMode,
  type ShipmentStatus,
  type TrackingEventInput,
  type TrackingStepCode,
} from '@konzia/shared';
import { AuditService } from '../audit/audit.service';
import type { OrgContext } from '../tenancy/org-context';
import { TenantDb, type TenantTx } from '../tenancy/tenant-db.service';
import { TrackingService } from './tracking.service';

const SHIPMENT_SELECT = {
  id: true,
  mode: true,
  origin: true,
  destination: true,
  carrier: true,
  reference: true,
  trackingNumber: true,
  departureEst: true,
  departureAt: true,
  arrivalEst: true,
  arrivalAt: true,
  costAmount: true,
  currency: true,
  status: true,
  createdAt: true,
  parcels: {
    where: { removedAt: null },
    select: { parcel: { select: { id: true, code: true, currentStepCode: true } } },
    orderBy: { addedAt: 'asc' },
  },
  events: {
    select: {
      id: true,
      kind: true,
      stepCode: true,
      anomalyType: true,
      occurredAt: true,
      recordedAt: true,
      location: true,
      note: true,
    },
    orderBy: { recordedAt: 'asc' },
  },
} as const satisfies Prisma.ShipmentSelect;

const ARRIVED_STEPS = new Set<string>([
  'arrived_drc',
  'customs',
  'released',
  'at_distribution_point',
  'ready_for_handover',
  'out_for_delivery',
  'delivered',
]);
const DEPARTED_STEPS = new Set<string>(['shipped_to_drc', 'in_transit', ...ARRIVED_STEPS]);

const iso = (d: Date | null) => d?.toISOString() ?? null;
const date = (v: string | null | undefined) =>
  v === undefined ? undefined : v === null ? null : new Date(v);

/** Expéditions (ticket #21) : un transport, plusieurs colis fermés ; ses étapes s'appliquent à chacun. */
@Injectable()
export class ShipmentsService {
  constructor(
    private readonly db: TenantDb,
    private readonly tracking: TrackingService,
    private readonly audit: AuditService,
  ) {}

  async create(userId: string, org: OrgContext, input: ShipmentInput): Promise<ShipmentInfo> {
    return this.db.run(userId, async (tx) => {
      const s = await tx.shipment.create({
        data: {
          organizationId: org.organizationId,
          ...this.fields(input),
          mode: input.mode,
          origin: input.origin,
          destination: input.destination,
          createdBy: userId,
        },
        select: { id: true },
      });
      await this.record(tx, org, userId, 'shipment.created', s.id, { after: input });
      return this.read(tx, org, s.id);
    });
  }

  async update(
    userId: string,
    org: OrgContext,
    id: string,
    input: Partial<ShipmentInput>,
  ): Promise<ShipmentInfo> {
    return this.db.run(userId, async (tx) => {
      const s = await this.find(tx, org, id);
      if (s.status === 'cancelled') throw new ConflictException('Expédition annulée.');
      await tx.shipment.update({ where: { id }, data: this.fields(input), select: { id: true } });
      await this.record(tx, org, userId, 'shipment.updated', id, { after: input });
      return this.read(tx, org, id);
    });
  }

  async addParcels(
    userId: string,
    org: OrgContext,
    id: string,
    parcelIds: string[],
  ): Promise<ShipmentInfo> {
    return this.db.run(userId, async (tx) => {
      const s = await this.find(tx, org, id);
      if (s.status !== 'planned')
        throw new ConflictException('L’expédition est partie : plus d’ajout de colis.');
      const parcels = await tx.parcel.findMany({
        where: { id: { in: parcelIds }, organizationId: org.organizationId },
        select: {
          id: true,
          code: true,
          status: true,
          shipments: { where: { removedAt: null }, select: { shipmentId: true } },
        },
      });
      if (parcels.length !== new Set(parcelIds).size)
        throw new BadRequestException('Colis introuvable.');
      for (const p of parcels) {
        if (p.status !== 'closed')
          throw new ConflictException(`Colis ${p.code} : fermez-le avant de l’expédier.`);
        if (p.shipments.length > 0)
          throw new ConflictException(`Colis ${p.code} : déjà dans une expédition.`);
      }
      try {
        await tx.shipmentParcel.createMany({
          data: parcels.map((p) => ({
            shipmentId: id,
            parcelId: p.id,
            organizationId: org.organizationId,
            addedBy: userId,
          })),
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError)
          throw new ConflictException('Colis ajouté entre-temps à une autre expédition.');
        throw err;
      }
      await this.record(tx, org, userId, 'shipment.parcels_added', id, {
        after: { parcels: parcels.map((p) => p.code) },
      });
      return this.read(tx, org, id);
    });
  }

  async removeParcel(
    userId: string,
    org: OrgContext,
    id: string,
    parcelId: string,
    reason: string,
  ): Promise<ShipmentInfo> {
    return this.db.run(userId, async (tx) => {
      const s = await this.find(tx, org, id);
      if (s.status !== 'planned')
        throw new ConflictException('L’expédition est partie : le colis voyage avec elle.');
      const link = await tx.shipmentParcel.findFirst({
        where: { shipmentId: id, parcelId, removedAt: null },
        select: { id: true },
      });
      if (!link) throw new NotFoundException('Colis absent de cette expédition.');
      await tx.shipmentParcel.update({
        where: { id: link.id },
        data: { removedAt: new Date(), removedBy: userId, removedReason: reason },
        select: { id: true },
      });
      await this.record(tx, org, userId, 'shipment.parcel_removed', id, {
        before: { parcelId },
        reason,
      });
      return this.read(tx, org, id);
    });
  }

  /** Étape d'expédition : enregistrée une fois, répercutée sur chaque colis concerné. */
  async recordEvent(
    userId: string,
    org: OrgContext,
    id: string,
    input: TrackingEventInput,
  ): Promise<ShipmentInfo & { skipped: string[] }> {
    return this.db.run(userId, async (tx) => {
      const s = await this.find(tx, org, id);
      if (s.status === 'cancelled') throw new ConflictException('Expédition annulée.');
      const links = await tx.shipmentParcel.findMany({
        where: { shipmentId: id, removedAt: null },
        select: { parcelId: true },
      });
      if (links.length === 0) throw new ConflictException('Ajoutez d’abord des colis.');
      const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
      const stepCode = input.kind === 'anomaly' ? 'anomaly' : input.stepCode;
      const ev = await tx.shipmentEvent.create({
        data: {
          shipmentId: id,
          organizationId: org.organizationId,
          kind: input.kind,
          stepCode,
          anomalyType: input.kind === 'anomaly' ? input.anomalyType : null,
          occurredAt,
          location: input.location ?? null,
          note: input.note ?? null,
          recordedBy: userId,
        },
        select: { id: true },
      });
      const skipped: string[] = [];
      for (const l of links) {
        const outcome = await this.tracking.applyEvent(
          tx,
          org,
          userId,
          l.parcelId,
          { ...input, occurredAt: occurredAt.toISOString() },
          ev.id,
        );
        if (outcome !== 'applied') skipped.push(outcome);
      }
      if (skipped.length === links.length)
        throw new ConflictException(`Aucun colis mis à jour. ${skipped[0]}`);

      // Statut et dates réelles de l'expédition déduits des étapes.
      const data: Prisma.ShipmentUpdateInput = {};
      if (input.kind !== 'anomaly') {
        if (DEPARTED_STEPS.has(stepCode) && s.status === 'planned') data.status = 'in_transit';
        if (ARRIVED_STEPS.has(stepCode) && s.status !== 'arrived') data.status = 'arrived';
        if (stepCode === 'shipped_to_drc' && !s.departureAt) data.departureAt = occurredAt;
        if (stepCode === 'arrived_drc' && !s.arrivalAt) data.arrivalAt = occurredAt;
      }
      if (Object.keys(data).length > 0)
        await tx.shipment.update({ where: { id }, data, select: { id: true } });
      await this.record(tx, org, userId, `shipment.event_${input.kind}`, id, {
        after: input,
        reason: input.kind === 'step' ? undefined : (input.note ?? undefined),
      });
      await this.tracking.syncOrders(
        tx,
        org,
        userId,
        links.map((l) => l.parcelId),
      );
      return { ...(await this.read(tx, org, id)), skipped };
    });
  }

  list(userId: string, org: OrgContext): Promise<ShipmentInfo[]> {
    return this.db.run(userId, async (tx) =>
      (
        await tx.shipment.findMany({
          where: { organizationId: org.organizationId },
          select: SHIPMENT_SELECT,
          orderBy: { createdAt: 'desc' },
          take: 100,
        })
      ).map(toInfo),
    );
  }

  get(userId: string, org: OrgContext, id: string): Promise<ShipmentInfo> {
    return this.db.run(userId, (tx) => this.read(tx, org, id));
  }

  private fields(input: Partial<ShipmentInput>) {
    return {
      ...(input.mode !== undefined ? { mode: input.mode } : {}),
      ...(input.origin !== undefined ? { origin: input.origin } : {}),
      ...(input.destination !== undefined ? { destination: input.destination } : {}),
      ...(input.carrier !== undefined ? { carrier: input.carrier } : {}),
      ...(input.reference !== undefined ? { reference: input.reference } : {}),
      ...(input.trackingNumber !== undefined ? { trackingNumber: input.trackingNumber } : {}),
      ...(input.departureEst !== undefined ? { departureEst: date(input.departureEst) } : {}),
      ...(input.departureAt !== undefined ? { departureAt: date(input.departureAt) } : {}),
      ...(input.arrivalEst !== undefined ? { arrivalEst: date(input.arrivalEst) } : {}),
      ...(input.arrivalAt !== undefined ? { arrivalAt: date(input.arrivalAt) } : {}),
      ...(input.costAmount !== undefined
        ? { costAmount: input.costAmount === null ? null : BigInt(input.costAmount) }
        : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
    };
  }

  private async find(tx: TenantTx, org: OrgContext, id: string) {
    const s = await tx.shipment.findFirst({
      where: { id, organizationId: org.organizationId },
      select: { status: true, departureAt: true, arrivalAt: true },
    });
    if (!s) throw new NotFoundException('Expédition introuvable.');
    return s;
  }

  private async read(tx: TenantTx, org: OrgContext, id: string): Promise<ShipmentInfo> {
    const s = await tx.shipment.findFirst({
      where: { id, organizationId: org.organizationId },
      select: SHIPMENT_SELECT,
    });
    if (!s) throw new NotFoundException('Expédition introuvable.');
    return toInfo(s);
  }

  private record(
    tx: TenantTx,
    org: OrgContext,
    userId: string,
    action: string,
    id: string,
    data: { before?: unknown; after?: unknown; reason?: string },
  ) {
    return this.audit.record(tx, {
      actorUserId: userId,
      actorRole: org.role,
      organizationId: org.organizationId,
      action,
      entityType: 'shipment',
      entityId: id,
      before: data.before as Prisma.InputJsonValue | undefined,
      after: data.after as Prisma.InputJsonValue | undefined,
      reason: data.reason ?? null,
    });
  }
}

function toInfo(s: Prisma.ShipmentGetPayload<{ select: typeof SHIPMENT_SELECT }>): ShipmentInfo {
  return {
    id: s.id,
    mode: s.mode as ShipmentMode,
    origin: s.origin,
    destination: s.destination,
    carrier: s.carrier,
    reference: s.reference,
    trackingNumber: s.trackingNumber,
    departureEst: iso(s.departureEst),
    departureAt: iso(s.departureAt),
    arrivalEst: iso(s.arrivalEst),
    arrivalAt: iso(s.arrivalAt),
    costAmount: s.costAmount === null ? null : Number(s.costAmount),
    currency: s.currency,
    status: s.status as ShipmentStatus,
    createdAt: s.createdAt.toISOString(),
    parcels: s.parcels.map((p) => ({
      id: p.parcel.id,
      code: p.parcel.code,
      currentStepCode: p.parcel.currentStepCode as TrackingStepCode | null,
    })),
    events: s.events.map((e) => ({
      id: e.id,
      kind: e.kind as ShipmentInfo['events'][number]['kind'],
      stepCode: e.stepCode as TrackingStepCode,
      label: STEP_LABELS[e.stepCode as TrackingStepCode] ?? e.stepCode,
      anomalyType: e.anomalyType as ShipmentInfo['events'][number]['anomalyType'],
      occurredAt: e.occurredAt.toISOString(),
      recordedAt: e.recordedAt.toISOString(),
      location: e.location,
      note: e.note,
      visibleToCustomer: true,
      viaShipment: true,
    })),
  };
}
