import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@konzia/db';
import {
  CANCELLABLE_STATUSES,
  PURCHASE_RULE_LABELS,
  ORG_NEXT_STATUSES,
  ORDER_STATUS_LABELS,
  ORG_ORDER_TABS,
  ORG_ORDER_TAB_STATUSES,
  type OrderDetail,
  type OrderNextAction,
  type OrgOrderPage,
  type OrgOrderPageQuery,
  type OrgOrderTab,
  type OrderPaymentStatus,
  type OrderStatus,
  type OrderSummary,
  type PurchaseRule,
} from '@konzia/shared';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { OrgContext } from '../tenancy/org-context';
import { TenantDb, type TenantTx } from '../tenancy/tenant-db.service';

const SUMMARY_SELECT = {
  id: true,
  number: true,
  status: true,
  paymentStatus: true,
  currency: true,
  finalAmount: true,
  createdAt: true,
  organizationId: true,
  orgCustomerId: true,
} as const;

/**
 * Règle d'achat (retour terrain R3) : peut-on commencer à acheter avant le paiement complet ?
 * Renvoie la raison du refus, ou null. La base revérifie (déclencheur orders_app_transition).
 */
export async function purchaseBlockReason(
  tx: Prisma.TransactionClient,
  order: {
    id: string;
    status: OrderStatus;
    purchaseRule: PurchaseRule;
    depositBps: number | null;
    finalAmount: bigint;
  },
): Promise<string | null> {
  // La règle ne s'applique qu'au premier achat : ensuite la commande est déjà « en achat ».
  if (!['awaiting_payment', 'payment_to_verify'].includes(order.status)) return null;
  if (order.purchaseRule === 'own_funds') return null;
  if (order.purchaseRule === 'full_payment')
    return 'Règle d’achat : la commande doit être payée en totalité avant l’achat.';
  const [row] = await tx.$queryRaw<
    { paid: bigint }[]
  >`SELECT order_net_paid(${order.id}::uuid) AS paid`;
  const needed = (order.finalAmount * BigInt(order.depositBps ?? 10000) + 9999n) / 10000n;
  if ((row?.paid ?? 0n) >= needed) return null;
  return `Règle d’achat : acompte de ${(order.depositBps ?? 0) / 100} % non atteint.`;
}

/** Numéro lisible : KZ-AAAA-NNNNNN (séquence PostgreSQL, sans trou de concurrence). */
export async function nextOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
  const [row] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('order_number_seq') AS n`;
  return `KZ-${new Date().getUTCFullYear()}-${String(row!.n).padStart(6, '0')}`;
}

/** Statuts avant le premier achat fournisseur. */
const PRE_PURCHASE_STATUSES: OrderStatus[] = ['awaiting_payment', 'payment_to_verify', 'paid'];

/** Statuts de paiement pour lesquels un solde reste dû. */
const OUTSTANDING: readonly OrderPaymentStatus[] = ['unpaid', 'partially_paid'];

/** Prochaine action déduite de l'étape, du paiement et des réceptions (aucune donnée nouvelle). */
export function nextAction(
  status: OrderStatus,
  payment: OrderPaymentStatus,
  paymentPending: boolean,
  itemsToReceive: boolean,
): OrderNextAction | null {
  if (status === 'completed' || status === 'cancelled' || status === 'in_dispute') return null;
  if (paymentPending || status === 'payment_to_verify') return 'verify_payment';
  switch (status) {
    case 'awaiting_payment':
      return 'await_payment';
    case 'paid':
      return 'purchase';
    case 'purchasing':
    case 'partially_purchased':
      return 'complete_purchase';
    case 'purchased':
      return itemsToReceive ? 'receive' : 'pack';
    case 'in_logistics':
      return 'ship';
    case 'in_transit':
      return 'await_arrival';
    case 'at_distribution_point':
      return 'prepare_handover';
    case 'ready_for_handover':
      return OUTSTANDING.includes(payment) ? 'collect_balance' : 'hand_over';
    default:
      return null;
  }
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly db: TenantDb,
    private readonly system: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --- Commissionnaire : faire avancer, annuler, proposer un ajustement -----------------

  async updateStatus(
    userId: string,
    org: OrgContext,
    orderId: string,
    to: OrderStatus,
    note: string | null,
  ): Promise<OrderDetail> {
    return this.db.run(userId, async (tx) => {
      const order = await this.orgOrder(tx, org, orderId);
      if (!ORG_NEXT_STATUSES[order.status]?.includes(to)) {
        throw new BadRequestException(
          `Passage impossible de « ${ORDER_STATUS_LABELS[order.status]} » à « ${ORDER_STATUS_LABELS[to]} ».`,
        );
      }
      if (to === 'purchasing') {
        const blocked = await purchaseBlockReason(tx, { id: orderId, ...order });
        if (blocked) throw new ConflictException(blocked);
      }
      // Décision D-1 : terminer une commande avec un solde impayé reste possible (crédit à un
      // client de confiance), mais seulement avec un motif écrit, conservé dans l'historique.
      if (to === 'completed' && OUTSTANDING.includes(order.paymentStatus) && !note?.trim()) {
        throw new BadRequestException(
          'Il reste un solde à payer : indiquez un motif pour terminer la commande.',
        );
      }
      await tx.order.update({ where: { id: orderId }, data: { status: to }, select: { id: true } });
      await tx.orderEvent.create({
        data: {
          orderId,
          organizationId: org.organizationId,
          type: 'status_changed',
          fromStatus: order.status,
          toStatus: to,
          actorUserId: userId,
          note,
        },
        select: { id: true },
      });
      return this.detail(tx, { id: orderId });
    });
  }

  /** Règle d'achat de la commande : modifiable tant que l'achat n'a pas commencé ; toujours tracée. */
  async setPurchaseRule(
    userId: string,
    org: OrgContext,
    orderId: string,
    rule: PurchaseRule,
    depositBps: number | null,
  ): Promise<OrderDetail> {
    return this.db.run(userId, async (tx) => {
      const order = await this.orgOrder(tx, org, orderId);
      if (!PRE_PURCHASE_STATUSES.includes(order.status))
        throw new ConflictException('L’achat a déjà commencé : la règle ne peut plus changer.');
      await tx.order.update({
        where: { id: orderId },
        data: { purchaseRule: rule, depositBps: rule === 'deposit' ? depositBps : null },
        select: { id: true },
      });
      const note =
        rule === 'deposit'
          ? `${PURCHASE_RULE_LABELS.deposit} de ${(depositBps ?? 0) / 100} %`
          : PURCHASE_RULE_LABELS[rule];
      await tx.orderEvent.create({
        data: {
          orderId,
          organizationId: org.organizationId,
          type: 'purchase_rule_changed',
          actorUserId: userId,
          note,
        },
        select: { id: true },
      });
      await this.audit.record(tx, {
        actorUserId: userId,
        actorRole: org.role,
        organizationId: org.organizationId,
        action: 'order.purchase_rule_changed',
        entityType: 'order',
        entityId: orderId,
        before: { rule: order.purchaseRule, depositBps: order.depositBps },
        after: { rule, depositBps: rule === 'deposit' ? depositBps : null },
      });
      return this.detail(tx, { id: orderId });
    });
  }

  async cancelByOrg(
    userId: string,
    org: OrgContext,
    orderId: string,
    reason: string,
  ): Promise<OrderDetail> {
    return this.db.run(userId, async (tx) => {
      const order = await this.orgOrder(tx, org, orderId);
      if (!CANCELLABLE_STATUSES.includes(order.status))
        throw new ConflictException(
          'Cette commande ne peut plus être annulée ici : ouvrez un litige.',
        );
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'cancelled', cancelledReason: reason },
        select: { id: true },
      });
      await tx.orderEvent.create({
        data: {
          orderId,
          organizationId: org.organizationId,
          type: 'cancelled',
          fromStatus: order.status,
          toStatus: 'cancelled',
          actorUserId: userId,
          note: reason,
        },
        select: { id: true },
      });
      await this.audit.record(tx, {
        actorUserId: userId,
        actorRole: org.role,
        organizationId: org.organizationId,
        action: 'order.cancelled',
        entityType: 'order',
        entityId: orderId,
        before: { status: order.status },
        after: { status: 'cancelled' },
        reason,
      });
      return this.detail(tx, { id: orderId });
    });
  }

  async proposeAdjustment(
    userId: string,
    org: OrgContext,
    orderId: string,
    amountDelta: number,
    reason: string,
  ): Promise<OrderDetail> {
    return this.db.run(userId, async (tx) => {
      const order = await this.orgOrder(tx, org, orderId);
      if (order.status === 'completed' || order.status === 'cancelled')
        throw new ConflictException('Commande close.');
      if (order.finalAmount + BigInt(amountDelta) < 0n)
        throw new BadRequestException('La remise dépasse le montant de la commande.');
      const open = await tx.orderAdjustment.findFirst({
        where: { orderId, status: 'proposed' },
        select: { id: true },
      });
      if (open) throw new ConflictException('Un ajustement attend déjà la réponse du client.');
      await tx.orderAdjustment.create({
        data: {
          orderId,
          organizationId: org.organizationId,
          customerUserId: order.customerUserId,
          amountDelta: BigInt(amountDelta),
          reason,
          proposedBy: userId,
        },
        select: { id: true },
      });
      await tx.orderEvent.create({
        data: {
          orderId,
          organizationId: org.organizationId,
          type: 'adjustment_proposed',
          actorUserId: userId,
          note: reason,
        },
        select: { id: true },
      });
      return this.detail(tx, { id: orderId });
    });
  }

  /** Client géré (sans compte) : le commissionnaire enregistre la réponse obtenue hors application. */
  async recordAdjustmentDecision(
    userId: string,
    org: OrgContext,
    orderId: string,
    adjustmentId: string,
    accepted: boolean,
    note: string,
  ): Promise<OrderDetail> {
    const order = await this.db.run(userId, (tx) => this.orgOrder(tx, org, orderId));
    if (order.customerUserId)
      throw new ConflictException('Ce client a un compte : c’est à lui de répondre dans Konzia.');
    await this.applyDecision(orderId, adjustmentId, accepted, userId, org.role, note, null);
    return this.getForOrg(userId, org, orderId);
  }

  // --- Client --------------------------------------------------------------------------

  async decideAdjustment(
    userId: string,
    orderId: string,
    adjustmentId: string,
    accepted: boolean,
  ): Promise<OrderDetail> {
    await this.applyDecision(orderId, adjustmentId, accepted, userId, 'customer', null, userId);
    return this.getForCustomer(userId, orderId);
  }

  /** Le client peut annuler tant que rien n'a été payé. */
  async cancelByCustomer(userId: string, orderId: string, reason: string): Promise<OrderDetail> {
    await this.system.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, customerUserId: userId },
        select: { status: true, organizationId: true },
      });
      if (!order) throw new NotFoundException('Commande introuvable.');
      if (order.status !== 'awaiting_payment') {
        throw new ConflictException(
          'Un paiement a déjà été déclaré : contactez le commissionnaire ou ouvrez un litige.',
        );
      }
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'cancelled', cancelledReason: reason },
      });
      await tx.orderEvent.create({
        data: {
          orderId,
          organizationId: order.organizationId,
          type: 'cancelled',
          fromStatus: order.status,
          toStatus: 'cancelled',
          actorUserId: userId,
          note: reason,
        },
      });
      await this.audit.recordSystem(
        {
          actorUserId: userId,
          actorRole: 'customer',
          organizationId: order.organizationId,
          action: 'order.cancelled',
          entityType: 'order',
          entityId: orderId,
          reason,
        },
        tx,
      );
    });
    return this.getForCustomer(userId, orderId);
  }

  /** Accepter applique la variation au montant final ; refuser la laisse sans effet. Chemin système audité. */
  private async applyDecision(
    orderId: string,
    adjustmentId: string,
    accepted: boolean,
    actorId: string,
    actorRole: string,
    note: string | null,
    customerUserId: string | null,
  ) {
    await this.system.$transaction(async (tx) => {
      const adj = await tx.orderAdjustment.findFirst({
        where: {
          id: adjustmentId,
          orderId,
          status: 'proposed',
          ...(customerUserId ? { customerUserId } : {}),
        },
        select: { id: true, amountDelta: true, organizationId: true, reason: true },
      });
      if (!adj) throw new NotFoundException('Ajustement introuvable ou déjà traité.');
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { finalAmount: true, status: true },
      });
      if (order.status === 'cancelled' || order.status === 'completed')
        throw new ConflictException('Commande close.');
      await tx.orderAdjustment.update({
        where: { id: adj.id },
        data: {
          status: accepted ? 'accepted' : 'rejected',
          decidedBy: actorId,
          decidedAt: new Date(),
          decisionNote: note,
        },
      });
      if (accepted)
        await tx.order.update({
          where: { id: orderId },
          data: { finalAmount: order.finalAmount + adj.amountDelta },
        });
      await tx.orderEvent.create({
        data: {
          orderId,
          organizationId: adj.organizationId,
          type: accepted ? 'adjustment_accepted' : 'adjustment_rejected',
          actorUserId: actorId,
          note: note ?? adj.reason,
        },
      });
      await this.audit.recordSystem(
        {
          actorUserId: actorId,
          actorRole,
          organizationId: adj.organizationId,
          action: accepted ? 'order.adjustment_accepted' : 'order.adjustment_rejected',
          entityType: 'order',
          entityId: orderId,
          before: { finalAmount: Number(order.finalAmount) },
          after: {
            finalAmount: Number(accepted ? order.finalAmount + adj.amountDelta : order.finalAmount),
          },
          reason: note,
        },
        tx,
      );
    });
  }

  private async orgOrder(tx: TenantTx, org: OrgContext, orderId: string) {
    const o = await tx.order.findFirst({
      where: { id: orderId, organizationId: org.organizationId },
      select: {
        status: true,
        finalAmount: true,
        customerUserId: true,
        purchaseRule: true,
        depositBps: true,
        paymentStatus: true,
      },
    });
    if (!o) throw new NotFoundException('Commande introuvable.');
    return o;
  }

  /** Tableau paginé du commissionnaire : onglets, recherche, tri, prochaine action (R-9). */
  pageForOrg(userId: string, org: OrgContext, q: OrgOrderPageQuery): Promise<OrgOrderPage> {
    return this.db.run(userId, async (tx) => {
      const base: Prisma.OrderWhereInput = { organizationId: org.organizationId };
      if (q.q) {
        const term = q.q;
        const digits = term.replace(/\D/g, '');
        const customers = await tx.orgCustomer.findMany({
          where: {
            organizationId: org.organizationId,
            OR: [
              { fullName: { contains: term, mode: 'insensitive' } },
              ...(digits.length >= 4 ? [{ phoneWhatsapp: { contains: digits } }] : []),
            ],
          },
          select: { id: true },
          take: 500,
        });
        base.OR = [
          { number: { contains: term, mode: 'insensitive' } },
          { orgCustomerId: { in: customers.map((c) => c.id) } },
        ];
      }
      if (q.payment === 'owing') base.paymentStatus = { in: [...OUTSTANDING] };
      if (q.payment === 'paid') base.paymentStatus = { notIn: [...OUTSTANDING] };

      const grouped = await tx.order.groupBy({
        by: ['status'],
        where: base,
        _count: { _all: true },
      });
      const byStatus = new Map(grouped.map((g) => [g.status, g._count._all]));
      const counts = Object.fromEntries(
        ORG_ORDER_TABS.map((tab) => [
          tab,
          tab === 'all'
            ? grouped.reduce((n, g) => n + g._count._all, 0)
            : ORG_ORDER_TAB_STATUSES[tab].reduce((n, s) => n + (byStatus.get(s) ?? 0), 0),
        ]),
      ) as Record<OrgOrderTab, number>;

      const where: Prisma.OrderWhereInput =
        q.tab === 'all' ? base : { ...base, status: { in: ORG_ORDER_TAB_STATUSES[q.tab] } };
      const orderBy: Prisma.OrderOrderByWithRelationInput =
        q.sort === 'amount'
          ? { finalAmount: q.dir }
          : q.sort === 'created'
            ? { createdAt: q.dir }
            : { updatedAt: q.dir };
      const rows = await tx.order.findMany({
        where,
        orderBy: [orderBy, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: { ...SUMMARY_SELECT, updatedAt: true },
      });
      const ids = rows.map((r) => r.id);
      const [summaries, items, pending] = await Promise.all([
        this.summaries(tx, rows),
        tx.orderItem.findMany({
          where: { orderId: { in: ids } },
          orderBy: { createdAt: 'asc' },
          select: {
            orderId: true,
            description: true,
            qtyPurchased: true,
            qtyReceived: true,
          },
        }),
        tx.payment.groupBy({
          by: ['orderId'],
          where: { orderId: { in: ids }, status: 'pending_verification' },
          _count: { _all: true },
        }),
      ]);
      const pendingIds = new Set(pending.map((p) => p.orderId));
      return {
        items: summaries.map((s, i) => {
          const own = items.filter((it) => it.orderId === s.id);
          return {
            ...s,
            itemCount: own.length,
            firstItem: own[0]?.description ?? null,
            updatedAt: rows[i]!.updatedAt.toISOString(),
            nextAction: nextAction(
              s.status,
              s.paymentStatus,
              pendingIds.has(s.id),
              own.some((it) => it.qtyReceived < it.qtyPurchased),
            ),
          };
        }),
        total: counts[q.tab],
        page: q.page,
        pageSize: q.pageSize,
        counts,
      };
    });
  }

  listForCustomer(userId: string): Promise<OrderSummary[]> {
    return this.db.run(userId, async (tx) => {
      const rows = await tx.order.findMany({
        where: { customerUserId: userId },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: SUMMARY_SELECT,
      });
      return this.summaries(tx, rows);
    });
  }

  listForOrg(userId: string, org: OrgContext): Promise<OrderSummary[]> {
    return this.db.run(userId, async (tx) => {
      const rows = await tx.order.findMany({
        where: { organizationId: org.organizationId },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: SUMMARY_SELECT,
      });
      return this.summaries(tx, rows);
    });
  }

  getForCustomer(userId: string, orderId: string): Promise<OrderDetail> {
    return this.db.run(userId, (tx) =>
      this.detail(tx, { id: orderId, customerUserId: userId }, { forCustomer: true }),
    );
  }

  getForOrg(userId: string, org: OrgContext, orderId: string): Promise<OrderDetail> {
    return this.db.run(userId, (tx) =>
      this.detail(tx, { id: orderId, organizationId: org.organizationId }),
    );
  }

  private async summaries(
    tx: TenantTx,
    rows: Prisma.OrderGetPayload<{ select: typeof SUMMARY_SELECT }>[],
  ): Promise<OrderSummary[]> {
    const orgs = await tx.organization.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.organizationId))] } },
      select: { id: true, name: true },
    });
    const customers = await tx.orgCustomer.findMany({
      where: { id: { in: rows.map((r) => r.orgCustomerId) } },
      select: { id: true, fullName: true },
    });
    const orgName = new Map(orgs.map((o) => [o.id, o.name]));
    const custName = new Map(customers.map((c) => [c.id, c.fullName]));
    return rows.map((r) => ({
      id: r.id,
      number: r.number,
      organizationName: orgName.get(r.organizationId) ?? '',
      // Le client ne lit pas les fiches du commissionnaire : son propre nom ne lui est pas utile ici.
      customerName: custName.get(r.orgCustomerId) ?? '',
      status: r.status,
      paymentStatus: r.paymentStatus,
      currency: r.currency,
      finalAmount: Number(r.finalAmount),
      createdAt: r.createdAt.toISOString(),
    }));
  }

  private async detail(
    tx: TenantTx,
    where: Prisma.OrderWhereInput,
    opts: { forCustomer?: boolean } = {},
  ): Promise<OrderDetail> {
    const o = await tx.order.findFirst({
      where,
      select: {
        ...SUMMARY_SELECT,
        agreedTotalAmount: true,
        quoteId: true,
        quoteVersionId: true,
        cancelledReason: true,
        purchaseRule: true,
        depositBps: true,
        items: {
          select: {
            id: true,
            description: true,
            quantity: true,
            unitAmount: true,
            amount: true,
            qtyPurchased: true,
            qtyReceived: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        events: {
          // La règle d'achat est un choix interne du commissionnaire.
          where: opts.forCustomer ? { type: { not: 'purchase_rule_changed' } } : {},
          select: { type: true, fromStatus: true, toStatus: true, note: true, at: true },
          orderBy: { at: 'asc' },
        },
        customerUserId: true,
        adjustments: {
          select: {
            id: true,
            amountDelta: true,
            reason: true,
            status: true,
            createdAt: true,
            decidedAt: true,
            decisionNote: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!o) throw new NotFoundException('Commande introuvable.');
    const [summary] = await this.summaries(tx, [o]);
    const contact = opts.forCustomer
      ? // Lecture système : le numéro public du commissionnaire de SA commande.
        (
          await this.system.organization.findUnique({
            where: { id: o.organizationId },
            select: { phoneWhatsapp: true },
          })
        )?.phoneWhatsapp
      : (
          await tx.orgCustomer.findUnique({
            where: { id: o.orgCustomerId },
            select: { phoneWhatsapp: true },
          })
        )?.phoneWhatsapp;
    const paid = opts.forCustomer
      ? await tx.payment.findMany({
          where: { orderId: o.id, status: 'confirmed' },
          select: { kind: true, orderAmount: true },
        })
      : null;
    const [net] = paid
      ? [
          {
            paid: paid.reduce(
              (n, p) => n + (p.kind === 'refund' ? -p.orderAmount : p.orderAmount),
              0n,
            ),
          },
        ]
      : await tx.$queryRaw<{ paid: bigint }[]>`SELECT order_net_paid(${o.id}::uuid) AS paid`;
    const version = await tx.quoteVersion.findUnique({
      where: { id: o.quoteVersionId },
      select: { versionNo: true },
    });
    const quote = await tx.quote.findUnique({
      where: { id: o.quoteId },
      select: { quoteRequestId: true },
    });
    return {
      ...summary!,
      agreedTotalAmount: Number(o.agreedTotalAmount),
      quoteVersionNo: version?.versionNo ?? 0,
      quoteId: o.quoteId,
      quoteRequestId: quote?.quoteRequestId ?? '',
      cancelledReason: o.cancelledReason,
      purchaseRule: o.purchaseRule,
      depositBps: o.depositBps,
      customerHasAccount: o.customerUserId !== null,
      contactWhatsapp: contact ?? null,
      netPaid: Number(net?.paid ?? 0n),
      adjustments: o.adjustments.map((a) => ({
        ...a,
        amountDelta: Number(a.amountDelta),
        createdAt: a.createdAt.toISOString(),
        decidedAt: a.decidedAt?.toISOString() ?? null,
      })),
      items: o.items.map((i) => ({
        ...i,
        unitAmount: Number(i.unitAmount),
        amount: Number(i.amount),
      })),
      events: o.events.map((e) => ({ ...e, at: e.at.toISOString() })),
    };
  }
}
