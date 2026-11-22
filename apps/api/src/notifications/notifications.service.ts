import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  formatMoney,
  NOTIFICATION_TYPE_LABELS,
  type Currency,
  type NotificationType,
  type OrgRole,
  type TrackingStepCode,
} from '@konzia/shared';
import { PrismaService } from '../prisma/prisma.service';

/** Faits métier qui déclenchent une notification (le contenu est construit ici, pas dans le métier). */
export type DomainEvent =
  | { kind: 'request_sent'; requestId: string; organizationIds: string[] }
  | { kind: 'quote_sent'; quoteId: string }
  | { kind: 'quote_expiring'; versionId: string }
  | { kind: 'payment_declared'; paymentId: string }
  | { kind: 'payment_confirmed'; paymentId: string }
  | { kind: 'purchase_done'; orderIds: string[] }
  | { kind: 'items_received'; orderIds: string[] }
  | { kind: 'parcel_step'; parcelId: string; stepCode: string; anomaly?: boolean }
  | { kind: 'order_completed'; orderId: string }
  | {
      kind: 'organization_status';
      organizationId: string;
      decision: 'approved' | 'rejected' | 'suspended' | 'reactivated';
      reason: string | null;
    };

export interface NewNotification {
  recipientUserId: string;
  organizationId: string | null;
  type: NotificationType;
  body: string;
  link: string;
  entityType?: string;
  entityId?: string;
}

/** Canal supplémentaire (e-mail, WhatsApp) branché sur les notifications créées. */
export interface NotificationChannel {
  deliver(created: (NewNotification & { id: string })[]): Promise<void>;
}
export const NOTIFICATION_CHANNELS = Symbol('NOTIFICATION_CHANNELS');

const STEP_TYPES: Partial<Record<TrackingStepCode, NotificationType>> = {
  shipped_to_drc: 'parcel_shipped',
  arrived_drc: 'parcel_arrived',
  ready_for_handover: 'parcel_available',
  out_for_delivery: 'out_for_delivery',
};

const money = (amount: bigint, currency: string) =>
  ['USD', 'CDF', 'CNY'].includes(currency)
    ? formatMoney(amount, currency as Currency)
    : `${amount} ${currency}`;

/**
 * Centre de notifications (ticket #23, EF-90). Appelé APRÈS la validation de l'action métier :
 * une notification manquée ne doit jamais annuler l'action, et une action annulée ne notifie pas.
 * Les destinataires sont résolus par le chemin système, strictement : membres concernés de
 * l'organisation, ou client titulaire de la commande / des articles du colis.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');

  constructor(
    private readonly system: PrismaService,
    @Optional() @Inject(NOTIFICATION_CHANNELS) private readonly channels?: NotificationChannel,
  ) {}

  emit(event: DomainEvent): Promise<void> {
    return this.emitMany([event]);
  }

  /** Plusieurs faits d'une même action : un seul envoi, sans doublon par destinataire et lien. */
  async emitMany(events: DomainEvent[]): Promise<void> {
    if (events.length === 0) return;
    try {
      const list: NewNotification[] = [];
      for (const e of events) list.push(...(await this.build(e)));
      await this.dispatch(list);
    } catch (err) {
      // Jamais de données personnelles dans les journaux : type d'événement seulement.
      this.logger.error(
        `notification « ${events.map((e) => e.kind).join(', ')} » non créée : ${(err as Error).name}`,
      );
    }
  }

  async dispatch(list: NewNotification[]): Promise<void> {
    const seen = new Set<string>();
    const unique = list.filter((n) => {
      const key = `${n.recipientUserId}|${n.type}|${n.link}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (unique.length === 0) return;
    const created = await this.system.notification.createManyAndReturn({
      data: unique.map((n) => ({
        recipientUserId: n.recipientUserId,
        organizationId: n.organizationId,
        type: n.type,
        title: NOTIFICATION_TYPE_LABELS[n.type],
        body: n.body,
        link: n.link,
        entityType: n.entityType ?? null,
        entityId: n.entityId ?? null,
      })),
      select: { id: true },
    });
    await this.channels?.deliver(unique.map((n, i) => ({ ...n, id: created[i]!.id })));
  }

  private async build(e: DomainEvent): Promise<NewNotification[]> {
    const db = this.system;
    switch (e.kind) {
      case 'request_sent': {
        const r = await db.quoteRequest.findUniqueOrThrow({
          where: { id: e.requestId },
          select: { customerUserId: true, _count: { select: { items: true } } },
        });
        const who = r.customerUserId
          ? (
              await db.user.findUnique({
                where: { id: r.customerUserId },
                select: { displayName: true },
              })
            )?.displayName
          : null;
        const out: NewNotification[] = [];
        for (const orgId of e.organizationIds)
          for (const userId of await this.members(orgId, ['owner', 'sales']))
            out.push({
              recipientUserId: userId,
              organizationId: orgId,
              type: 'request_received',
              body: `${who ?? 'Un client'} vous demande un devis (${r._count.items} article(s)).`,
              link: `/pro/demandes/${e.requestId}`,
            });
        return out;
      }
      case 'quote_sent':
      case 'quote_expiring': {
        const version =
          e.kind === 'quote_expiring'
            ? await db.quoteVersion.findUniqueOrThrow({
                where: { id: e.versionId },
                select: {
                  quoteId: true,
                  id: true,
                  totalAmount: true,
                  currency: true,
                  validUntil: true,
                },
              })
            : null;
        const quoteId = version?.quoteId ?? (e as { quoteId: string }).quoteId;
        const q = await db.quote.findUniqueOrThrow({
          where: { id: quoteId },
          select: {
            customerUserId: true,
            quoteRequestId: true,
            organizationId: true,
            organization: { select: { name: true } },
            versions: {
              where: { status: 'sent' },
              select: { id: true, totalAmount: true, currency: true, validUntil: true },
              orderBy: { versionNo: 'desc' },
              take: 1,
            },
          },
        });
        const v = version ?? q.versions[0];
        if (!q.customerUserId || !v) return [];
        const until = v.validUntil.toLocaleDateString('fr-FR', { timeZone: 'Africa/Lubumbashi' });
        return [
          {
            recipientUserId: q.customerUserId,
            organizationId: q.organizationId,
            type: e.kind === 'quote_sent' ? 'quote_received' : 'quote_expiring',
            body:
              e.kind === 'quote_sent'
                ? `${q.organization.name} vous propose ${money(v.totalAmount, v.currency)}, valable jusqu’au ${until}.`
                : `Le devis de ${q.organization.name} (${money(v.totalAmount, v.currency)}) expire le ${until}.`,
            link: `/demandes/${q.quoteRequestId}`,
            entityType: 'quote_version',
            entityId: v.id,
          },
        ];
      }
      case 'payment_declared':
      case 'payment_confirmed': {
        const p = await db.payment.findUniqueOrThrow({
          where: { id: e.paymentId },
          select: {
            amount: true,
            currency: true,
            organizationId: true,
            customerUserId: true,
            orderId: true,
            order: { select: { number: true, orgCustomerId: true } },
          },
        });
        if (e.kind === 'payment_confirmed') {
          if (!p.customerUserId) return [];
          return [
            {
              recipientUserId: p.customerUserId,
              organizationId: p.organizationId,
              type: 'payment_confirmed',
              body: `Votre paiement de ${money(p.amount, p.currency)} pour la commande ${p.order.number} est confirmé.`,
              link: `/commandes/${p.orderId}`,
            },
          ];
        }
        const customer = await db.orgCustomer.findUnique({
          where: { id: p.order.orgCustomerId },
          select: { fullName: true },
        });
        return (await this.members(p.organizationId, ['owner', 'accountant'])).map((userId) => ({
          recipientUserId: userId,
          organizationId: p.organizationId,
          type: 'payment_to_confirm' as const,
          body: `${customer?.fullName ?? 'Un client'} déclare avoir payé ${money(p.amount, p.currency)} (commande ${p.order.number}).`,
          link: '/pro/paiements',
        }));
      }
      case 'purchase_done':
      case 'items_received':
      case 'order_completed': {
        const ids = e.kind === 'order_completed' ? [e.orderId] : e.orderIds;
        const orders = await db.order.findMany({
          where: { id: { in: ids }, customerUserId: { not: null } },
          select: { id: true, number: true, customerUserId: true, organizationId: true },
        });
        const text = {
          purchase_done: (n: string) =>
            `Vos articles de la commande ${n} ont été achetés auprès du vendeur.`,
          items_received: (n: string) =>
            `Des articles de votre commande ${n} sont arrivés à l’entrepôt.`,
          order_completed: (n: string) => `Votre commande ${n} est terminée. Merci !`,
        }[e.kind];
        return orders.map((o) => ({
          recipientUserId: o.customerUserId!,
          organizationId: o.organizationId,
          type: e.kind,
          body: text(o.number),
          link: `/commandes/${o.id}`,
        }));
      }
      case 'organization_status': {
        const org = await db.organization.findUniqueOrThrow({
          where: { id: e.organizationId },
          select: { name: true },
        });
        const text = {
          approved: `${org.name} est vérifié : votre profil est visible des clients.`,
          rejected: `Le dossier de vérification de ${org.name} n’a pas été accepté.`,
          suspended: `${org.name} est suspendu : aucune action n’est possible pour le moment.`,
          reactivated: `${org.name} est de nouveau actif.`,
        }[e.decision];
        return (await this.members(e.organizationId, ['owner'])).map((userId) => ({
          recipientUserId: userId,
          organizationId: e.organizationId,
          type: 'organization_status' as const,
          body: e.reason ? `${text} Motif : ${e.reason}` : text,
          link: '/pro/profil',
        }));
      }
      case 'parcel_step': {
        const type = e.anomaly ? 'parcel_anomaly' : STEP_TYPES[e.stepCode as TrackingStepCode];
        if (!type) return [];
        const parcel = await db.parcel.findUniqueOrThrow({
          where: { id: e.parcelId },
          select: { code: true, organizationId: true, routeTemplateId: true },
        });
        if (!e.anomaly) {
          // Étape masquée au client dans l'itinéraire du colis : pas de notification.
          const step = await db.routeTemplateStep.findFirst({
            where: {
              routeTemplateId: parcel.routeTemplateId ?? '00000000-0000-7000-8000-000000000001',
              code: e.stepCode,
            },
            select: { visibleToCustomer: true },
          });
          if (!step?.visibleToCustomer) return [];
        }
        const items = await db.parcelItem.findMany({
          where: { parcelId: e.parcelId, removedAt: null },
          select: {
            orgCustomerId: true,
            orderItem: { select: { orderId: true, order: { select: { number: true } } } },
          },
        });
        const phrases: Partial<Record<NotificationType, string>> = {
          parcel_shipped: 'est parti vers la RDC',
          parcel_arrived: 'est arrivé en RDC',
          parcel_available: 'est prêt : vous pouvez le retirer ou attendre la livraison',
          out_for_delivery: 'est en cours de livraison',
          parcel_anomaly: 'rencontre un problème : votre commissionnaire vous contactera',
        };
        const body = phrases[type] ?? '';
        const owners = new Map(
          (
            await db.orgCustomer.findMany({
              where: { id: { in: items.map((i) => i.orgCustomerId) }, userId: { not: null } },
              select: { id: true, userId: true },
            })
          ).map((c) => [c.id, c.userId!]),
        );
        return items
          .filter((i) => owners.has(i.orgCustomerId))
          .map((i) => ({
            recipientUserId: owners.get(i.orgCustomerId)!,
            organizationId: parcel.organizationId,
            type,
            body: `Le colis ${parcel.code} (commande ${i.orderItem.order.number}) ${body}.`,
            link: `/commandes/${i.orderItem.orderId}`,
          }));
      }
    }
  }

  private async members(organizationId: string, roles: OrgRole[]): Promise<string[]> {
    const rows = await this.system.organizationMember.findMany({
      where: { organizationId, status: 'active', role: { in: roles } },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  /** Rappel « devis bientôt expiré » : versions envoyées qui expirent dans les 24 h, une seule fois. */
  async remindExpiringQuotes(now = new Date()): Promise<number> {
    const soon = new Date(now.getTime() + 24 * 3_600_000);
    const versions = await this.system.quoteVersion.findMany({
      where: { status: 'sent', validUntil: { gt: now, lte: soon } },
      select: { id: true },
      take: 500,
    });
    let sent = 0;
    for (const v of versions) {
      const already = await this.system.notification.count({
        where: { entityId: v.id, type: 'quote_expiring' },
      });
      if (already > 0) continue;
      await this.emit({ kind: 'quote_expiring', versionId: v.id });
      sent++;
    }
    return sent;
  }
}
