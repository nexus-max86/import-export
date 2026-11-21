import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@konzia/db';
import {
  convertMinor,
  convertMinorInverse,
  formatRate,
  parseRate,
  PaymentInstructionsSchema,
  type CustomerBalance,
  type DeclarePaymentInput,
  type OrderStatus,
  type PaymentInfo,
  type PaymentInstruction,
  type RecordPaymentInput,
  type RefundInput,
} from '@konzia/shared';
import { AuditService } from '../audit/audit.service';
import { FilesService } from '../files/files.service';
import { FxService } from '../fx/fx.service';
import { PrismaService } from '../prisma/prisma.service';
import type { OrgContext } from '../tenancy/org-context';
import { TenantDb } from '../tenancy/tenant-db.service';

type Tx = Prisma.TransactionClient;

const PAYMENT_SELECT = {
  id: true,
  orderId: true,
  kind: true,
  method: true,
  provider: true,
  amount: true,
  currency: true,
  orderAmount: true,
  fxRate: true,
  payerReference: true,
  note: true,
  proofFileId: true,
  status: true,
  rejectionReason: true,
  declaredBy: true,
  customerUserId: true,
  confirmedAt: true,
  createdAt: true,
  order: { select: { number: true, currency: true } },
} as const;

type PaymentRow = Prisma.PaymentGetPayload<{ select: typeof PAYMENT_SELECT }>;

function toInfo(p: PaymentRow): PaymentInfo {
  return {
    id: p.id,
    orderId: p.orderId,
    orderNumber: p.order.number,
    kind: p.kind,
    method: p.method,
    provider: p.provider,
    amount: Number(p.amount),
    currency: p.currency,
    orderAmount: Number(p.orderAmount),
    orderCurrency: p.order.currency,
    fxRate: p.fxRate ? formatRate(parseRate(p.fxRate.toFixed(8))!) : null,
    reference: p.payerReference,
    note: p.note,
    hasProof: p.proofFileId !== null,
    status: p.status,
    rejectionReason: p.rejectionReason,
    declaredByCustomer: p.customerUserId !== null && p.declaredBy === p.customerUserId,
    confirmedAt: p.confirmedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}

/** Statuts où le paiement pilote l'avancement de la commande. */
const PAYMENT_STAGE: OrderStatus[] = ['awaiting_payment', 'payment_to_verify', 'paid'];

@Injectable()
export class PaymentsService {
  constructor(
    private readonly db: TenantDb,
    private readonly system: PrismaService,
    private readonly fx: FxService,
    private readonly files: FilesService,
    private readonly audit: AuditService,
  ) {}

  // --- Instructions de paiement -------------------------------------------------

  async setInstructions(
    userId: string,
    org: OrgContext,
    instructions: PaymentInstruction[],
  ): Promise<PaymentInstruction[]> {
    await this.db.run(userId, async (tx) => {
      await tx.organization.update({
        where: { id: org.organizationId },
        data: { paymentInstructions: instructions as unknown as Prisma.InputJsonValue },
        select: { id: true },
      });
      await this.audit.record(tx, {
        actorUserId: userId,
        actorRole: org.role,
        organizationId: org.organizationId,
        action: 'payment.instructions_updated',
        entityType: 'organization',
        entityId: org.organizationId,
        after: instructions as unknown as Prisma.InputJsonValue,
      });
    });
    return instructions;
  }

  async getInstructions(userId: string, org: OrgContext): Promise<PaymentInstruction[]> {
    return this.db.run(userId, async (tx) => {
      const o = await tx.organization.findUniqueOrThrow({
        where: { id: org.organizationId },
        select: { paymentInstructions: true },
      });
      return this.parseInstructions(o.paymentInstructions);
    });
  }

  /** Instructions du commissionnaire d'une commande, pour son client. */
  async instructionsForOrder(
    userId: string,
    orderId: string,
  ): Promise<{ organizationName: string; instructions: PaymentInstruction[] }> {
    const order = await this.db.run(userId, (tx) =>
      tx.order.findFirst({
        where: { id: orderId, customerUserId: userId },
        select: { organizationId: true },
      }),
    );
    if (!order) throw new NotFoundException('Commande introuvable.');
    // Lecture système : une organisation suspendue reste lisible pour ses clients en cours.
    const o = await this.system.organization.findUniqueOrThrow({
      where: { id: order.organizationId },
      select: { name: true, paymentInstructions: true },
    });
    return {
      organizationName: o.name,
      instructions: this.parseInstructions(o.paymentInstructions),
    };
  }

  // --- Client --------------------------------------------------------------------

  /** Le client déclare un paiement : « à vérifier » jusqu'à la confirmation du commissionnaire. */
  async declare(userId: string, orderId: string, input: DeclarePaymentInput): Promise<PaymentInfo> {
    const id = await this.system.$transaction(async (tx) => {
      const existing = await tx.payment.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: { id: true, declaredBy: true },
      });
      if (existing) {
        if (existing.declaredBy !== userId)
          throw new ConflictException('Clé de requête déjà utilisée.');
        return existing.id;
      }
      const order = await tx.order.findFirst({
        where: { id: orderId, customerUserId: userId },
        select: {
          id: true,
          status: true,
          currency: true,
          organizationId: true,
          orgCustomerId: true,
        },
      });
      if (!order) throw new NotFoundException('Commande introuvable.');
      if (order.status === 'cancelled' || order.status === 'completed')
        throw new ConflictException('Cette commande est close.');
      if (input.proofFileId) {
        const proof = await tx.storedFile.findFirst({
          where: { id: input.proofFileId, ownerUserId: userId, purpose: 'payment_proof' },
          select: { id: true },
        });
        if (!proof) throw new BadRequestException('Preuve de paiement introuvable.');
      }
      const converted = await this.toOrderCurrency(
        tx,
        BigInt(input.amount),
        input.currency,
        order.currency,
      );
      const p = await tx.payment.create({
        data: {
          organizationId: order.organizationId,
          orderId,
          orgCustomerId: order.orgCustomerId,
          customerUserId: userId,
          method: input.method,
          provider: input.provider ?? null,
          amount: BigInt(input.amount),
          currency: input.currency,
          orderAmount: converted.amount,
          fxRate: converted.rate,
          payerReference: input.reference ?? null,
          proofFileId: input.proofFileId ?? null,
          status: 'pending_verification',
          declaredBy: userId,
          idempotencyKey: input.idempotencyKey,
          events: {
            create: { organizationId: order.organizationId, type: 'declared', actorUserId: userId },
          },
        },
        select: { id: true },
      });
      await this.recompute(tx, orderId, userId);
      await this.audit.recordSystem(
        {
          actorUserId: userId,
          actorRole: 'customer',
          organizationId: order.organizationId,
          action: 'payment.declared',
          entityType: 'payment',
          entityId: p.id,
          after: { amount: input.amount, currency: input.currency },
        },
        tx,
      );
      return p.id;
    });
    return this.readOne(id);
  }

  async cancelDeclaration(userId: string, paymentId: string): Promise<PaymentInfo> {
    await this.system.$transaction(async (tx) => {
      const p = await tx.payment.findFirst({
        where: { id: paymentId, declaredBy: userId, customerUserId: userId },
        select: { status: true, orderId: true, organizationId: true },
      });
      if (!p) throw new NotFoundException('Paiement introuvable.');
      if (p.status !== 'pending_verification')
        throw new ConflictException('Ce paiement a déjà été traité.');
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: 'cancelled',
          events: {
            create: { organizationId: p.organizationId, type: 'cancelled', actorUserId: userId },
          },
        },
      });
      await this.recompute(tx, p.orderId, userId);
    });
    return this.readOne(paymentId);
  }

  // --- Commissionnaire ---------------------------------------------------------------

  async confirm(userId: string, org: OrgContext, paymentId: string): Promise<PaymentInfo> {
    await this.system.$transaction(async (tx) => {
      const p = await this.orgPayment(tx, org, paymentId);
      if (p.status !== 'pending_verification')
        throw new ConflictException('Ce paiement a déjà été traité.');
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: 'confirmed',
          confirmedBy: userId,
          confirmedAt: new Date(),
          events: {
            create: { organizationId: org.organizationId, type: 'confirmed', actorUserId: userId },
          },
        },
      });
      await this.recompute(tx, p.orderId, userId);
      await this.audit.recordSystem(
        {
          actorUserId: userId,
          actorRole: org.role,
          organizationId: org.organizationId,
          action: 'payment.confirmed',
          entityType: 'payment',
          entityId: paymentId,
          after: { amount: Number(p.amount), currency: p.currency },
        },
        tx,
      );
    });
    return this.readOne(paymentId);
  }

  async reject(
    userId: string,
    org: OrgContext,
    paymentId: string,
    reason: string,
  ): Promise<PaymentInfo> {
    await this.system.$transaction(async (tx) => {
      const p = await this.orgPayment(tx, org, paymentId);
      if (p.status !== 'pending_verification')
        throw new ConflictException('Ce paiement a déjà été traité.');
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: 'rejected',
          rejectionReason: reason,
          events: {
            create: {
              organizationId: org.organizationId,
              type: 'rejected',
              actorUserId: userId,
              note: reason,
            },
          },
        },
      });
      await this.recompute(tx, p.orderId, userId);
      await this.audit.recordSystem(
        {
          actorUserId: userId,
          actorRole: org.role,
          organizationId: org.organizationId,
          action: 'payment.rejected',
          entityType: 'payment',
          entityId: paymentId,
          reason,
        },
        tx,
      );
    });
    return this.readOne(paymentId);
  }

  /** Paiement reçu hors application (client géré, espèces…) : confirmé d'emblée par le commissionnaire. */
  recordOffline(
    userId: string,
    org: OrgContext,
    orderId: string,
    input: RecordPaymentInput,
  ): Promise<PaymentInfo> {
    return this.recordByOrg(userId, org, orderId, 'payment', input);
  }

  /** Remboursement : enregistrement distinct, jamais une modification du paiement d'origine. */
  refund(
    userId: string,
    org: OrgContext,
    orderId: string,
    input: RefundInput,
  ): Promise<PaymentInfo> {
    return this.recordByOrg(userId, org, orderId, 'refund', input);
  }

  private async recordByOrg(
    userId: string,
    org: OrgContext,
    orderId: string,
    kind: 'payment' | 'refund',
    input: RecordPaymentInput,
  ) {
    const id = await this.system.$transaction(async (tx) => {
      const existing = await tx.payment.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: { id: true, organizationId: true },
      });
      if (existing) {
        if (existing.organizationId !== org.organizationId)
          throw new ConflictException('Clé de requête déjà utilisée.');
        return existing.id;
      }
      const order = await tx.order.findFirst({
        where: { id: orderId, organizationId: org.organizationId },
        select: { status: true, currency: true, orgCustomerId: true, customerUserId: true },
      });
      if (!order) throw new NotFoundException('Commande introuvable.');
      if (kind === 'payment' && order.status === 'cancelled')
        throw new ConflictException('Commande annulée : enregistrez plutôt un remboursement.');
      const converted = await this.toOrderCurrency(
        tx,
        BigInt(input.amount),
        input.currency,
        order.currency,
      );
      if (kind === 'refund') {
        const { net } = await this.totals(tx, orderId);
        if (converted.amount > net)
          throw new BadRequestException(
            'Le remboursement dépasse les sommes reçues pour cette commande.',
          );
      }
      const p = await tx.payment.create({
        data: {
          organizationId: org.organizationId,
          orderId,
          orgCustomerId: order.orgCustomerId,
          customerUserId: order.customerUserId,
          kind,
          method: input.method,
          provider: input.provider ?? null,
          amount: BigInt(input.amount),
          currency: input.currency,
          orderAmount: converted.amount,
          fxRate: converted.rate,
          payerReference: input.reference ?? null,
          note: input.note ?? null,
          status: 'confirmed',
          declaredBy: userId,
          confirmedBy: userId,
          confirmedAt: new Date(),
          idempotencyKey: input.idempotencyKey,
          events: {
            create: {
              organizationId: org.organizationId,
              type: kind === 'refund' ? 'refunded' : 'recorded',
              actorUserId: userId,
              note: input.note ?? null,
            },
          },
        },
        select: { id: true },
      });
      await this.recompute(tx, orderId, userId);
      await this.audit.recordSystem(
        {
          actorUserId: userId,
          actorRole: org.role,
          organizationId: org.organizationId,
          action: kind === 'refund' ? 'payment.refunded' : 'payment.recorded',
          entityType: 'payment',
          entityId: p.id,
          after: { amount: input.amount, currency: input.currency },
          reason: input.note ?? null,
        },
        tx,
      );
      return p.id;
    });
    return this.readOne(id);
  }

  // --- Lectures ------------------------------------------------------------------------

  listForCustomerOrder(userId: string, orderId: string): Promise<PaymentInfo[]> {
    return this.db.run(userId, async (tx) =>
      (
        await tx.payment.findMany({
          where: { orderId, customerUserId: userId },
          select: PAYMENT_SELECT,
          orderBy: { createdAt: 'asc' },
        })
      ).map(toInfo),
    );
  }

  listForOrg(
    userId: string,
    org: OrgContext,
    filter: { orderId?: string; pending?: boolean },
  ): Promise<PaymentInfo[]> {
    return this.db.run(userId, async (tx) =>
      (
        await tx.payment.findMany({
          where: {
            organizationId: org.organizationId,
            ...(filter.orderId ? { orderId: filter.orderId } : {}),
            ...(filter.pending ? { status: 'pending_verification' } : {}),
          },
          select: PAYMENT_SELECT,
          orderBy: { createdAt: filter.pending ? 'asc' : 'desc' },
          take: 300,
        })
      ).map(toInfo),
    );
  }

  /** Preuve de paiement déchiffrée, pour les membres autorisés du commissionnaire (RLS sur files). */
  async proof(userId: string, org: OrgContext, paymentId: string) {
    const file = await this.db.run(userId, async (tx) => {
      const p = await tx.payment.findFirst({
        where: { id: paymentId, organizationId: org.organizationId },
        select: { proofFileId: true },
      });
      if (!p?.proofFileId) return null;
      return tx.storedFile.findFirst({
        where: { id: p.proofFileId },
        select: { storageKey: true, mime: true, originalName: true },
      });
    });
    if (!file) throw new NotFoundException('Aucune preuve pour ce paiement.');
    return { ...file, content: await this.files.read(file.storageKey) };
  }

  /** « Qui doit combien » : par client et par devise, commandes non annulées. */
  balances(userId: string, org: OrgContext): Promise<CustomerBalance[]> {
    return this.db.run(userId, async (tx) => {
      const orders = await tx.order.findMany({
        where: { organizationId: org.organizationId, status: { not: 'cancelled' } },
        select: {
          id: true,
          number: true,
          currency: true,
          finalAmount: true,
          paymentStatus: true,
          orgCustomerId: true,
        },
        orderBy: { createdAt: 'asc' },
      });
      const payments = await tx.payment.findMany({
        where: {
          organizationId: org.organizationId,
          orderId: { in: orders.map((o) => o.id) },
          status: { in: ['confirmed', 'pending_verification'] },
        },
        select: { orderId: true, kind: true, status: true, orderAmount: true },
      });
      const customers = await tx.orgCustomer.findMany({
        where: { id: { in: [...new Set(orders.map((o) => o.orgCustomerId))] } },
        select: { id: true, fullName: true },
      });
      const names = new Map(customers.map((c) => [c.id, c.fullName]));
      const byKey = new Map<string, CustomerBalance>();
      for (const o of orders) {
        const mine = payments.filter((p) => p.orderId === o.id);
        const paid = mine
          .filter((p) => p.status === 'confirmed')
          .reduce((s, p) => s + (p.kind === 'refund' ? -p.orderAmount : p.orderAmount), 0n);
        const pending = mine
          .filter((p) => p.status === 'pending_verification')
          .reduce((s, p) => s + p.orderAmount, 0n);
        const outstanding = o.finalAmount - paid;
        const key = `${o.orgCustomerId}:${o.currency}`;
        const b =
          byKey.get(key) ??
          ({
            orgCustomerId: o.orgCustomerId,
            customerName: names.get(o.orgCustomerId) ?? '',
            currency: o.currency,
            due: 0,
            paid: 0,
            outstanding: 0,
            pendingVerification: 0,
            orders: [],
          } as CustomerBalance);
        b.due += Number(o.finalAmount);
        b.paid += Number(paid);
        b.outstanding += Number(outstanding);
        b.pendingVerification += Number(pending);
        b.orders.push({
          id: o.id,
          number: o.number,
          finalAmount: Number(o.finalAmount),
          paid: Number(paid),
          outstanding: Number(outstanding),
          paymentStatus: o.paymentStatus,
        });
        byKey.set(key, b);
      }
      return [...byKey.values()].sort((a, b) => b.outstanding - a.outstanding);
    });
  }

  // --- Interne ---------------------------------------------------------------------------

  private async toOrderCurrency(
    tx: Tx,
    amount: bigint,
    from: string,
    to: string,
  ): Promise<{ amount: bigint; rate: string | null }> {
    if (from === to) return { amount, rate: null };
    const rate = await this.fx.current(tx, 'USD_CDF').catch(() => null);
    if (!rate)
      throw new BadRequestException(
        'Aucun taux USD/CDF publié : payez dans la devise de la commande.',
      );
    const converted =
      from === 'USD' && to === 'CDF'
        ? convertMinor(amount, rate.scaled)
        : convertMinorInverse(amount, rate.scaled);
    if (converted <= 0n) throw new BadRequestException('Montant trop faible.');
    return { amount: converted, rate: formatRate(rate.scaled) };
  }

  private async totals(tx: Tx, orderId: string) {
    const confirmed = await tx.payment.findMany({
      where: { orderId, status: 'confirmed' },
      select: { kind: true, orderAmount: true },
    });
    const received = confirmed
      .filter((p) => p.kind === 'payment')
      .reduce((s, p) => s + p.orderAmount, 0n);
    const refunded = confirmed
      .filter((p) => p.kind === 'refund')
      .reduce((s, p) => s + p.orderAmount, 0n);
    const pending = await tx.payment.count({ where: { orderId, status: 'pending_verification' } });
    return { received, refunded, net: received - refunded, pending };
  }

  /** Recalcule le statut de paiement et, tant que l'achat n'a pas commencé, l'étape de la commande. */
  private async recompute(tx: Tx, orderId: string, actorUserId: string): Promise<void> {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { status: true, finalAmount: true, paymentStatus: true, organizationId: true },
    });
    const { received, refunded, net, pending } = await this.totals(tx, orderId);
    const paymentStatus =
      refunded > 0n
        ? net <= 0n
          ? 'refunded'
          : 'partially_refunded'
        : net >= order.finalAmount
          ? 'paid'
          : net > 0n
            ? 'partially_paid'
            : 'unpaid';
    let status: OrderStatus = order.status;
    if (PAYMENT_STAGE.includes(order.status)) {
      status =
        net >= order.finalAmount && received > 0n
          ? 'paid'
          : pending > 0
            ? 'payment_to_verify'
            : 'awaiting_payment';
    }
    if (paymentStatus !== order.paymentStatus || status !== order.status) {
      await tx.order.update({ where: { id: orderId }, data: { paymentStatus, status } });
    }
    if (status !== order.status) {
      await tx.orderEvent.create({
        data: {
          orderId,
          organizationId: order.organizationId,
          type: 'payment',
          fromStatus: order.status,
          toStatus: status,
          actorUserId,
        },
      });
    }
  }

  private async orgPayment(tx: Tx, org: OrgContext, paymentId: string) {
    const p = await tx.payment.findFirst({
      where: { id: paymentId, organizationId: org.organizationId },
      select: { status: true, orderId: true, amount: true, currency: true },
    });
    if (!p) throw new NotFoundException('Paiement introuvable.');
    return p;
  }

  private async readOne(paymentId: string): Promise<PaymentInfo> {
    return toInfo(
      await this.system.payment.findUniqueOrThrow({
        where: { id: paymentId },
        select: PAYMENT_SELECT,
      }),
    );
  }

  private parseInstructions(raw: unknown): PaymentInstruction[] {
    const parsed = PaymentInstructionsSchema.safeParse({ instructions: raw ?? [] });
    return parsed.success ? parsed.data.instructions : [];
  }
}
