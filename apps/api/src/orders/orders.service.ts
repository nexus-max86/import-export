import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@konzia/db';
import type { OrderDetail, OrderSummary } from '@konzia/shared';
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

/** Numéro lisible : KZ-AAAA-NNNNNN (séquence PostgreSQL, sans trou de concurrence). */
export async function nextOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
  const [row] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('order_number_seq') AS n`;
  return `KZ-${new Date().getUTCFullYear()}-${String(row!.n).padStart(6, '0')}`;
}

@Injectable()
export class OrdersService {
  constructor(private readonly db: TenantDb) {}

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
    return this.db.run(userId, (tx) => this.detail(tx, { id: orderId, customerUserId: userId }));
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

  private async detail(tx: TenantTx, where: Prisma.OrderWhereInput): Promise<OrderDetail> {
    const o = await tx.order.findFirst({
      where,
      select: {
        ...SUMMARY_SELECT,
        agreedTotalAmount: true,
        quoteId: true,
        quoteVersionId: true,
        cancelledReason: true,
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
          select: { type: true, fromStatus: true, toStatus: true, note: true, at: true },
          orderBy: { at: 'asc' },
        },
      },
    });
    if (!o) throw new NotFoundException('Commande introuvable.');
    const [summary] = await this.summaries(tx, [o]);
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
      items: o.items.map((i) => ({
        ...i,
        unitAmount: Number(i.unitAmount),
        amount: Number(i.amount),
      })),
      events: o.events.map((e) => ({ ...e, at: e.at.toISOString() })),
    };
  }
}
