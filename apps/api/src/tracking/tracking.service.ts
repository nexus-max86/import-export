import { NotificationsService, type DomainEvent } from '../notifications/notifications.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@konzia/db';
import {
  LOGISTICS_ORDER_STATUSES,
  orderStatusForStep,
  STEP_LABELS,
  type OrderStatus,
  type RouteTemplateInfo,
  type RouteTemplateInput,
  type ShipmentMode,
  type TrackingEventInfo,
  type TrackingEventInput,
  type TrackingStepCode,
} from '@konzia/shared';
import { AuditService } from '../audit/audit.service';
import type { OrgContext } from '../tenancy/org-context';
import { TenantDb, type TenantTx } from '../tenancy/tenant-db.service';

/** Modèle global semé par la migration (cahier §5.4). */
export const GLOBAL_ROUTE_TEMPLATE_ID = '00000000-0000-7000-8000-000000000001';

/** Fait à notifier pour un événement de colis (les étapes sans notification sont ignorées plus loin). */
export function parcelStepEvent(parcelId: string, input: TrackingEventInput): DomainEvent {
  return input.kind === 'anomaly'
    ? { kind: 'parcel_step', parcelId, stepCode: 'anomaly', anomaly: true }
    : { kind: 'parcel_step', parcelId, stepCode: input.stepCode };
}

/** À partir de cette étape, le colis voyage : il doit être fermé. */
const SHIPPED_FROM: TrackingStepCode = 'shipped_to_drc';

export const EVENT_SELECT = {
  id: true,
  kind: true,
  stepCode: true,
  anomalyType: true,
  occurredAt: true,
  recordedAt: true,
  location: true,
  note: true,
  visibleToCustomer: true,
  shipmentEventId: true,
} as const satisfies Prisma.ParcelEventSelect;

export function toEventInfo(
  e: Prisma.ParcelEventGetPayload<{ select: typeof EVENT_SELECT }>,
  labels?: Map<string, string>,
): TrackingEventInfo {
  const code = e.stepCode as TrackingStepCode;
  return {
    id: e.id,
    kind: e.kind as TrackingEventInfo['kind'],
    stepCode: code,
    label: labels?.get(code) ?? STEP_LABELS[code] ?? code,
    anomalyType: e.anomalyType as TrackingEventInfo['anomalyType'],
    occurredAt: e.occurredAt.toISOString(),
    recordedAt: e.recordedAt.toISOString(),
    location: e.location,
    note: e.note,
    visibleToCustomer: e.visibleToCustomer,
    viaShipment: e.shipmentEventId !== null,
  };
}

type TemplateSteps = { code: string; labelFr: string; visibleToCustomer: boolean }[];

/**
 * Suivi logistique (ticket #21) : itinéraires configurables, événements de colis en insertion
 * seule, et commandes qui suivent leur colis le moins avancé.
 */
@Injectable()
export class TrackingService {
  constructor(
    private readonly db: TenantDb,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // --- Itinéraires ---------------------------------------------------------------

  listTemplates(userId: string, org: OrgContext): Promise<RouteTemplateInfo[]> {
    return this.db.run(userId, async (tx) => {
      const rows = await tx.routeTemplate.findMany({
        where: {
          isActive: true,
          OR: [{ organizationId: null }, { organizationId: org.organizationId }],
        },
        select: {
          id: true,
          name: true,
          mode: true,
          organizationId: true,
          steps: {
            select: { code: true, labelFr: true, visibleToCustomer: true },
            orderBy: { position: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map((t) => ({
        id: t.id,
        name: t.name,
        mode: t.mode as ShipmentMode | null,
        global: t.organizationId === null,
        steps: t.steps.map((s) => ({
          code: s.code as TrackingStepCode,
          label: s.labelFr,
          visibleToCustomer: s.visibleToCustomer,
        })),
      }));
    });
  }

  async createTemplate(
    userId: string,
    org: OrgContext,
    input: RouteTemplateInput,
  ): Promise<RouteTemplateInfo> {
    const id = await this.db.run(userId, async (tx) => {
      const t = await tx.routeTemplate.create({
        data: {
          organizationId: org.organizationId,
          name: input.name,
          mode: input.mode ?? null,
          steps: {
            create: input.steps.map((s, i) => ({
              organizationId: org.organizationId,
              position: i + 1,
              code: s.code,
              labelFr: s.label ?? STEP_LABELS[s.code],
              visibleToCustomer: s.visibleToCustomer,
            })),
          },
        },
        select: { id: true },
      });
      await this.audit.record(tx, {
        actorUserId: userId,
        actorRole: org.role,
        organizationId: org.organizationId,
        action: 'route_template.created',
        entityType: 'route_template',
        entityId: t.id,
        after: input,
      });
      return t.id;
    });
    const all = await this.listTemplates(userId, org);
    return all.find((t) => t.id === id)!;
  }

  /** Vérifie qu'un itinéraire est utilisable par l'organisation. */
  async assertTemplate(tx: TenantTx, org: OrgContext, id: string): Promise<void> {
    const t = await tx.routeTemplate.findFirst({
      where: {
        id,
        isActive: true,
        OR: [{ organizationId: null }, { organizationId: org.organizationId }],
      },
      select: { id: true },
    });
    if (!t) throw new BadRequestException('Itinéraire introuvable.');
  }

  async templateSteps(tx: TenantTx, templateId: string | null): Promise<TemplateSteps> {
    return tx.routeTemplateStep.findMany({
      where: { routeTemplateId: templateId ?? GLOBAL_ROUTE_TEMPLATE_ID },
      select: { code: true, labelFr: true, visibleToCustomer: true },
      orderBy: { position: 'asc' },
    });
  }

  // --- Événements de colis ------------------------------------------------------

  async recordParcelEvent(
    userId: string,
    org: OrgContext,
    parcelId: string,
    input: TrackingEventInput,
  ): Promise<void> {
    const completed = await this.db.run(userId, async (tx) => {
      const outcome = await this.applyEvent(tx, org, userId, parcelId, input, null);
      if (outcome !== 'applied') throw new ConflictException(outcome);
      await this.audit.record(tx, {
        actorUserId: userId,
        actorRole: org.role,
        organizationId: org.organizationId,
        action: `parcel.event_${input.kind}`,
        entityType: 'parcel',
        entityId: parcelId,
        after: input,
        reason: input.kind === 'step' ? null : (input.note ?? null),
      });
      return this.syncOrders(tx, org, userId, [parcelId]);
    });
    await this.notifications.emitMany([
      parcelStepEvent(parcelId, input),
      ...completed.map((orderId) => ({ kind: 'order_completed' as const, orderId })),
    ]);
  }

  /**
   * Enregistre un événement sur un colis. Renvoie 'applied' ou la raison du refus (utilisée
   * telle quelle pour un colis seul, ou pour ignorer un colis lors d'un événement d'expédition).
   */
  async applyEvent(
    tx: TenantTx,
    org: OrgContext,
    userId: string,
    parcelId: string,
    input: TrackingEventInput,
    shipmentEventId: string | null,
  ): Promise<'applied' | string> {
    const parcel = await tx.parcel.findFirst({
      where: { id: parcelId, organizationId: org.organizationId },
      select: { code: true, status: true, routeTemplateId: true, currentStepCode: true },
    });
    if (!parcel) throw new NotFoundException('Colis introuvable.');
    const steps = await this.templateSteps(tx, parcel.routeTemplateId);
    const pos = (code: string | null) => steps.findIndex((s) => s.code === code);
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
    if (occurredAt.getTime() > Date.now() + 5 * 60_000)
      return 'La date de l’événement est dans le futur.';

    if (parcel.status === 'cancelled') return `Colis ${parcel.code} annulé.`;
    if (input.kind !== 'correction' && (parcel.status === 'delivered' || parcel.status === 'lost'))
      return `Colis ${parcel.code} clos : enregistrez une correction si besoin.`;

    let stepCode: string;
    let visible = true;
    let nextStatus = parcel.status;
    let nextStep = parcel.currentStepCode;
    if (input.kind === 'anomaly') {
      stepCode = 'anomaly';
      if (input.anomalyType === 'lost') nextStatus = 'lost';
    } else {
      const idx = pos(input.stepCode);
      if (idx < 0) return `Étape absente de l’itinéraire du colis ${parcel.code}.`;
      if (input.kind === 'step' && idx <= pos(parcel.currentStepCode))
        return `Colis ${parcel.code} : étape déjà passée (enregistrez une correction pour revenir en arrière).`;
      if (idx >= pos(SHIPPED_FROM) && pos(SHIPPED_FROM) >= 0 && parcel.status === 'open')
        return `Fermez le colis ${parcel.code} avant de l’expédier.`;
      stepCode = input.stepCode;
      visible = steps[idx]!.visibleToCustomer;
      nextStep = input.stepCode;
      if (input.stepCode === 'delivered') nextStatus = 'delivered';
      else if (parcel.status === 'delivered' || parcel.status === 'lost') nextStatus = 'closed';
    }

    await tx.parcelEvent.createMany({
      data: [
        {
          parcelId,
          organizationId: org.organizationId,
          kind: input.kind,
          stepCode,
          anomalyType: input.kind === 'anomaly' ? input.anomalyType : null,
          occurredAt,
          location: input.location ?? null,
          note: input.note ?? null,
          visibleToCustomer: visible,
          shipmentEventId,
          recordedBy: userId,
        },
      ],
    });
    if (nextStep !== parcel.currentStepCode || nextStatus !== parcel.status)
      await tx.parcel.update({
        where: { id: parcelId },
        data: { currentStepCode: nextStep, status: nextStatus },
        select: { id: true },
      });
    return 'applied';
  }

  // --- Commandes suivant leurs colis --------------------------------------------------

  /**
   * Fait avancer les commandes concernées : chaque commande suit son colis le moins avancé,
   * et seulement quand tous ses articles sont en colis. Jamais de retour en arrière automatique.
   */
  async syncOrders(
    tx: TenantTx,
    org: OrgContext,
    userId: string,
    parcelIds: string[],
  ): Promise<string[]> {
    const completed: string[] = [];
    const touched = await tx.parcelItem.findMany({
      where: { parcelId: { in: parcelIds }, removedAt: null },
      select: { orderItem: { select: { orderId: true } } },
    });
    const orderIds = [...new Set(touched.map((t) => t.orderItem.orderId))];
    for (const orderId of orderIds) {
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        select: {
          status: true,
          items: {
            select: {
              quantity: true,
              parcelItems: {
                where: { removedAt: null, parcel: { status: { not: 'cancelled' } } },
                select: {
                  quantity: true,
                  parcel: { select: { currentStepCode: true, status: true } },
                },
              },
            },
          },
        },
      });
      const from = LOGISTICS_ORDER_STATUSES.indexOf(order.status);
      if (from < 0 || order.status === 'completed') continue;
      const allPacked = order.items.every(
        (i) => i.parcelItems.reduce((n, p) => n + p.quantity, 0) >= i.quantity,
      );
      if (!allPacked) continue;
      const parcels = order.items.flatMap((i) => i.parcelItems.map((p) => p.parcel));
      if (parcels.some((p) => p.status === 'lost')) continue;
      const target = Math.min(
        ...parcels.map((p) =>
          LOGISTICS_ORDER_STATUSES.indexOf(orderStatusForStep(p.currentStepCode)),
        ),
      );
      let prev: OrderStatus = order.status;
      for (let i = from + 1; i <= target; i++) {
        const to = LOGISTICS_ORDER_STATUSES[i]!;
        await tx.order.update({
          where: { id: orderId },
          data: { status: to },
          select: { id: true },
        });
        await tx.orderEvent.create({
          data: {
            orderId,
            organizationId: org.organizationId,
            type: 'status_changed',
            fromStatus: prev,
            toStatus: to,
            actorUserId: userId,
            note: 'Suivi des colis.',
          },
          select: { id: true },
        });
        prev = to;
        if (to === 'completed') completed.push(orderId);
      }
    }
    return completed;
  }
}
