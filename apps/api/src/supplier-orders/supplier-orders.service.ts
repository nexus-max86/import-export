import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@konzia/db';
import {
  ORDER_STATUS_LABELS,
  type MarketplaceCode,
  type OrderStatus,
  type PurchasableItem,
  type ReceiveInput,
  type SupplierOrderInfo,
  type SupplierOrderInput,
} from '@konzia/shared';
import { AuditService } from '../audit/audit.service';
import { FilesService } from '../files/files.service';
import { purchaseBlockReason } from '../orders/orders.service';
import type { OrgContext } from '../tenancy/org-context';
import { TenantDb, type TenantTx } from '../tenancy/tenant-db.service';

const SUPPLIER_SELECT = {
  id: true,
  marketplace: true,
  storeName: true,
  externalRef: true,
  purchasedAt: true,
  amount: true,
  currency: true,
  conversionFeeAmount: true,
  sellerTrackingNumber: true,
  proofFileId: true,
  note: true,
  status: true,
  items: {
    select: {
      orderItemId: true,
      qtyPurchased: true,
      qtyReceived: true,
      orderItem: {
        select: { description: true, orderId: true, order: { select: { number: true } } },
      },
    },
    orderBy: { createdAt: 'asc' },
  },
} as const satisfies Prisma.SupplierOrderSelect;

type SupplierRow = Prisma.SupplierOrderGetPayload<{ select: typeof SUPPLIER_SELECT }>;

function toInfo(s: SupplierRow): SupplierOrderInfo {
  return {
    id: s.id,
    marketplace: s.marketplace as MarketplaceCode | null,
    storeName: s.storeName,
    externalRef: s.externalRef,
    purchasedAt: s.purchasedAt.toISOString(),
    amount: Number(s.amount),
    currency: s.currency,
    conversionFeeAmount: Number(s.conversionFeeAmount),
    sellerTrackingNumber: s.sellerTrackingNumber,
    hasProof: s.proofFileId !== null,
    note: s.note,
    status: s.status,
    items: s.items.map((i) => ({
      orderItemId: i.orderItemId,
      orderId: i.orderItem.orderId,
      orderNumber: i.orderItem.order.number,
      description: i.orderItem.description,
      qtyPurchased: i.qtyPurchased,
      qtyReceived: i.qtyReceived,
    })),
  };
}

/** Statuts où une commande peut encore recevoir des achats fournisseurs. */
const PURCHASABLE: OrderStatus[] = [
  'awaiting_payment',
  'payment_to_verify',
  'paid',
  'purchasing',
  'partially_purchased',
];
const PRE_PURCHASE: OrderStatus[] = ['awaiting_payment', 'payment_to_verify', 'paid'];

/**
 * Achats fournisseurs (ticket #19) : coûts réels, jamais visibles du client ni des rôles
 * commerciaux (RLS : propriétaire et acheteur ; lecture comptable).
 */
@Injectable()
export class SupplierOrdersService {
  constructor(
    private readonly db: TenantDb,
    private readonly files: FilesService,
    private readonly audit: AuditService,
  ) {}

  async create(
    userId: string,
    org: OrgContext,
    input: SupplierOrderInput,
  ): Promise<SupplierOrderInfo> {
    return this.db.run(userId, async (tx) => {
      const ids = input.items.map((i) => i.orderItemId);
      if (new Set(ids).size !== ids.length)
        throw new BadRequestException('Un article apparaît deux fois dans cet achat.');
      if (input.proofFileId) {
        const proof = await tx.storedFile.findFirst({
          where: {
            id: input.proofFileId,
            organizationId: org.organizationId,
            purpose: 'purchase_proof',
          },
          select: { id: true },
        });
        if (!proof) throw new BadRequestException('Preuve d’achat introuvable.');
      }
      const items = await tx.orderItem.findMany({
        where: { id: { in: ids }, organizationId: org.organizationId },
        select: { id: true, orderId: true, description: true, quantity: true, qtyPurchased: true },
      });
      if (items.length !== ids.length) throw new BadRequestException('Article introuvable.');
      const byId = new Map(items.map((i) => [i.id, i]));

      const orderIds = [...new Set(items.map((i) => i.orderId))];
      const orders = await tx.order.findMany({
        where: { id: { in: orderIds } },
        select: {
          id: true,
          number: true,
          status: true,
          purchaseRule: true,
          depositBps: true,
          finalAmount: true,
        },
      });
      for (const o of orders) {
        if (!PURCHASABLE.includes(o.status))
          throw new ConflictException(
            `Commande ${o.number} : achat impossible au statut « ${ORDER_STATUS_LABELS[o.status]} ».`,
          );
        const blocked = await purchaseBlockReason(tx, o);
        if (blocked) throw new ConflictException(`Commande ${o.number} — ${blocked}`);
      }

      const created = await tx.supplierOrder.create({
        data: {
          organizationId: org.organizationId,
          marketplace: input.marketplace ?? null,
          storeName: input.storeName,
          externalRef: input.externalRef ?? null,
          purchasedAt: new Date(input.purchasedAt),
          amount: BigInt(input.amount),
          currency: input.currency,
          conversionFeeAmount: BigInt(input.conversionFeeAmount),
          sellerTrackingNumber: input.sellerTrackingNumber ?? null,
          proofFileId: input.proofFileId ?? null,
          note: input.note ?? null,
          createdBy: userId,
          items: {
            create: input.items.map((i) => ({
              orderItemId: i.orderItemId,
              organizationId: org.organizationId,
              qtyPurchased: i.quantity,
            })),
          },
        },
        select: { id: true },
      });

      // Mise à jour conditionnelle : deux achats simultanés ne peuvent pas dépasser la quantité.
      for (const i of input.items) {
        const item = byId.get(i.orderItemId)!;
        const res = await tx.orderItem.updateMany({
          where: { id: i.orderItemId, qtyPurchased: { lte: item.quantity - i.quantity } },
          data: { qtyPurchased: { increment: i.quantity } },
        });
        if (res.count !== 1)
          throw new BadRequestException(
            `« ${item.description} » : quantité supérieure au reste à acheter (${item.quantity - item.qtyPurchased}).`,
          );
      }

      for (const o of orders) await this.advanceOrder(tx, org, userId, o.id, o.status);

      await this.audit.record(tx, {
        actorUserId: userId,
        actorRole: org.role,
        organizationId: org.organizationId,
        action: 'supplier_order.created',
        entityType: 'supplier_order',
        entityId: created.id,
        after: {
          amount: input.amount,
          currency: input.currency,
          orders: orders.map((o) => o.number),
          items: input.items,
        },
      });
      return this.read(tx, org, created.id);
    });
  }

  /** Fait suivre l'état de la commande : achat en cours, puis partiellement acheté ou acheté. */
  private async advanceOrder(
    tx: TenantTx,
    org: OrgContext,
    userId: string,
    orderId: string,
    from: OrderStatus,
  ) {
    const items = await tx.orderItem.findMany({
      where: { orderId },
      select: { quantity: true, qtyPurchased: true },
    });
    const target: OrderStatus = items.every((i) => i.qtyPurchased >= i.quantity)
      ? 'purchased'
      : 'partially_purchased';
    const steps: OrderStatus[] = [];
    let current = from;
    if (PRE_PURCHASE.includes(current)) steps.push((current = 'purchasing'));
    if (current !== target) steps.push(target);
    let prev = from;
    for (const to of steps) {
      await tx.order.update({ where: { id: orderId }, data: { status: to }, select: { id: true } });
      await tx.orderEvent.create({
        data: {
          orderId,
          organizationId: org.organizationId,
          type: 'status_changed',
          fromStatus: prev,
          toStatus: to,
          actorUserId: userId,
          note: to === 'purchasing' ? 'Premier achat fournisseur enregistré.' : null,
        },
        select: { id: true },
      });
      prev = to;
    }
  }

  async update(
    userId: string,
    org: OrgContext,
    id: string,
    input: {
      sellerTrackingNumber?: string | null;
      status?: 'shipped_by_seller';
      note?: string | null;
    },
  ): Promise<SupplierOrderInfo> {
    return this.db.run(userId, async (tx) => {
      const so = await this.find(tx, org, id);
      if (input.status && so.status !== 'placed')
        throw new ConflictException('Cet achat a déjà été marqué expédié ou reçu.');
      await tx.supplierOrder.update({
        where: { id },
        data: {
          ...(input.sellerTrackingNumber !== undefined
            ? { sellerTrackingNumber: input.sellerTrackingNumber }
            : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
          ...(input.status ? { status: input.status } : {}),
        },
        select: { id: true },
      });
      await this.audit.record(tx, {
        actorUserId: userId,
        actorRole: org.role,
        organizationId: org.organizationId,
        action: 'supplier_order.updated',
        entityType: 'supplier_order',
        entityId: id,
        before: { status: so.status, sellerTrackingNumber: so.sellerTrackingNumber },
        after: input,
      });
      return this.read(tx, org, id);
    });
  }

  /** Réception à l'entrepôt : quantités reçues (absolues) par article ; corrige aussi les erreurs de saisie. */
  async receive(
    userId: string,
    org: OrgContext,
    id: string,
    input: ReceiveInput,
  ): Promise<SupplierOrderInfo> {
    return this.db.run(userId, async (tx) => {
      const so = await this.find(tx, org, id);
      if (so.status === 'cancelled' || so.status === 'refunded')
        throw new ConflictException('Cet achat est clos.');
      const lines = await tx.supplierOrderItem.findMany({
        where: { supplierOrderId: id },
        select: { id: true, orderItemId: true, qtyPurchased: true, qtyReceived: true },
      });
      const byItem = new Map(lines.map((l) => [l.orderItemId, l]));
      for (const r of input.items) {
        const line = byItem.get(r.orderItemId);
        if (!line) throw new BadRequestException('Article absent de cet achat.');
        if (r.qtyReceived > line.qtyPurchased)
          throw new BadRequestException(
            `Quantité reçue supérieure à la quantité achetée (${line.qtyPurchased}).`,
          );
        const delta = r.qtyReceived - line.qtyReceived;
        if (delta === 0) continue;
        await tx.supplierOrderItem.update({
          where: { id: line.id },
          data: { qtyReceived: r.qtyReceived },
          select: { id: true },
        });
        await tx.orderItem.update({
          where: { id: r.orderItemId },
          data: { qtyReceived: { increment: delta } },
          select: { id: true },
        });
        line.qtyReceived = r.qtyReceived;
      }
      const all = [...byItem.values()];
      const status = all.every((l) => l.qtyReceived === l.qtyPurchased)
        ? 'received'
        : all.some((l) => l.qtyReceived > 0)
          ? 'partially_received'
          : so.status === 'shipped_by_seller'
            ? 'shipped_by_seller'
            : 'placed';
      if (status !== so.status)
        await tx.supplierOrder.update({ where: { id }, data: { status }, select: { id: true } });
      await this.audit.record(tx, {
        actorUserId: userId,
        actorRole: org.role,
        organizationId: org.organizationId,
        action: 'supplier_order.received',
        entityType: 'supplier_order',
        entityId: id,
        before: { status: so.status },
        after: { status, items: input.items },
      });
      return this.read(tx, org, id);
    });
  }

  list(userId: string, org: OrgContext, orderId?: string): Promise<SupplierOrderInfo[]> {
    return this.db.run(userId, async (tx) =>
      (
        await tx.supplierOrder.findMany({
          where: {
            organizationId: org.organizationId,
            ...(orderId ? { items: { some: { orderItem: { orderId } } } } : {}),
          },
          select: SUPPLIER_SELECT,
          orderBy: { purchasedAt: 'desc' },
          take: 200,
        })
      ).map(toInfo),
    );
  }

  get(userId: string, org: OrgContext, id: string): Promise<SupplierOrderInfo> {
    return this.db.run(userId, (tx) => this.read(tx, org, id));
  }

  /** Articles encore à acheter, toutes commandes confondues, avec la règle d'achat appliquée. */
  purchasable(userId: string, org: OrgContext): Promise<PurchasableItem[]> {
    return this.db.run(userId, async (tx) => {
      const orders = await tx.order.findMany({
        where: { organizationId: org.organizationId, status: { in: PURCHASABLE } },
        select: {
          id: true,
          number: true,
          status: true,
          purchaseRule: true,
          depositBps: true,
          finalAmount: true,
          orgCustomerId: true,
          items: {
            select: { id: true, description: true, quantity: true, qtyPurchased: true },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
        take: 300,
      });
      const customers = await tx.orgCustomer.findMany({
        where: { id: { in: [...new Set(orders.map((o) => o.orgCustomerId))] } },
        select: { id: true, fullName: true },
      });
      const names = new Map(customers.map((c) => [c.id, c.fullName]));
      const result: PurchasableItem[] = [];
      for (const o of orders) {
        const blocked = await purchaseBlockReason(tx, o);
        for (const i of o.items) {
          if (i.qtyPurchased >= i.quantity) continue;
          result.push({
            orderItemId: i.id,
            orderId: o.id,
            orderNumber: o.number,
            customerName: names.get(o.orgCustomerId) ?? '',
            description: i.description,
            quantity: i.quantity,
            qtyPurchased: i.qtyPurchased,
            canPurchase: blocked === null,
            blockedReason: blocked,
          });
        }
      }
      return result;
    });
  }

  async storeProof(
    userId: string,
    org: OrgContext,
    upload: Parameters<FilesService['store']>[4],
  ): Promise<{ fileId: string }> {
    const stored = await this.db.run(userId, (tx) =>
      this.files.store(tx, userId, org.organizationId, 'purchase_proof', upload),
    );
    return { fileId: stored.id };
  }

  async proof(userId: string, org: OrgContext, id: string) {
    const file = await this.db.run(userId, async (tx) => {
      const so = await this.find(tx, org, id);
      if (!so.proofFileId) return null;
      return tx.storedFile.findFirst({
        where: { id: so.proofFileId, purpose: 'purchase_proof' },
        select: { storageKey: true, mime: true, originalName: true },
      });
    });
    if (!file) throw new NotFoundException('Aucune preuve pour cet achat.');
    return { ...file, content: await this.files.read(file.storageKey) };
  }

  private async find(tx: TenantTx, org: OrgContext, id: string) {
    const so = await tx.supplierOrder.findFirst({
      where: { id, organizationId: org.organizationId },
      select: { status: true, sellerTrackingNumber: true, proofFileId: true },
    });
    if (!so) throw new NotFoundException('Achat introuvable.');
    return so;
  }

  private async read(tx: TenantTx, org: OrgContext, id: string): Promise<SupplierOrderInfo> {
    const so = await tx.supplierOrder.findFirst({
      where: { id, organizationId: org.organizationId },
      select: SUPPLIER_SELECT,
    });
    if (!so) throw new NotFoundException('Achat introuvable.');
    return toInfo(so);
  }
}
