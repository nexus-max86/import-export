import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@konzia/db';
import type {
  AdminAuditRow,
  AdminListQuery,
  AdminOrderRow,
  AdminOrganizationDetail,
  AdminOrganizationRow,
  AdminOverview,
  AdminPage,
  AdminParcelRow,
  AdminPaymentRow,
  AdminUserRow,
} from '@konzia/shared';
import { AuditService } from '../audit/audit.service';
import { FilesService } from '../files/files.service';
import { PrismaService } from '../prisma/prisma.service';

const ORG_STATUSES = ['pending', 'approved', 'rejected', 'suspended'] as const;

/**
 * Console d'administration (ticket #26, EF-103), en lecture. Chemin système (lecture de toutes
 * les organisations) : CHAQUE lecture d'une donnée de commissionnaire ou de client est
 * journalisée (« admin.read ») avec ses filtres, pour qu'aucun accès ne passe inaperçu.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly system: PrismaService,
    private readonly audit: AuditService,
    private readonly files: FilesService,
  ) {}

  private trace(
    adminId: string,
    entityType: string,
    details: { entityId?: string; organizationId?: string | null; filters?: object },
  ) {
    return this.audit.recordSystem({
      actorUserId: adminId,
      actorRole: 'platform_admin',
      organizationId: details.organizationId ?? null,
      action: 'admin.read',
      entityType,
      entityId: details.entityId ?? null,
      after: (details.filters ?? {}) as Prisma.InputJsonValue,
    });
  }

  private page<T>(q: AdminListQuery, total: number, items: T[]): AdminPage<T> {
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  private skip(q: AdminListQuery) {
    return { skip: (q.page - 1) * q.pageSize, take: q.pageSize };
  }

  async overview(adminId: string): Promise<AdminOverview> {
    const db = this.system;
    const [users, orgs, toReview, active, completed, toVerify, parcels, disputes] =
      await Promise.all([
        db.user.count(),
        db.organization.groupBy({ by: ['status'], _count: { _all: true } }),
        db.organizationVerification.count({ where: { status: 'submitted' } }),
        db.order.count({ where: { status: { notIn: ['completed', 'cancelled'] } } }),
        db.order.count({ where: { status: 'completed' } }),
        db.payment.count({ where: { status: 'pending_verification' } }),
        db.parcel.count({ where: { status: { in: ['open', 'closed'] } } }),
        this.openDisputes(),
      ]);
    await this.trace(adminId, 'overview', {});
    const organizations = Object.fromEntries(
      ORG_STATUSES.map((s) => [s, 0]),
    ) as AdminOverview['organizations'];
    for (const g of orgs) organizations[g.status] = g._count._all;
    return {
      users,
      organizations,
      verificationsToReview: toReview,
      ordersActive: active,
      ordersCompleted: completed,
      paymentsToVerify: toVerify,
      parcelsInProgress: parcels,
      disputesOpen: disputes,
    };
  }

  /** Remplacé par le décompte réel quand les litiges existent (ticket #28). */
  protected async openDisputes(): Promise<number> {
    return 0;
  }

  async users(adminId: string, q: AdminListQuery): Promise<AdminPage<AdminUserRow>> {
    const where: Prisma.UserWhereInput = {
      ...(q.q
        ? {
            OR: [
              { email: { contains: q.q.toLowerCase() } },
              { displayName: { contains: q.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(q.status === 'active' || q.status === 'suspended' ? { status: q.status } : {}),
    };
    const [total, rows] = await Promise.all([
      this.system.user.count({ where }),
      this.system.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          displayName: true,
          platformRole: true,
          status: true,
          emailVerifiedAt: true,
          mfaEnabledAt: true,
          createdAt: true,
          _count: { select: { memberships: true } },
        },
        orderBy: { createdAt: 'desc' },
        ...this.skip(q),
      }),
    ]);
    await this.trace(adminId, 'users', { filters: q });
    return this.page(
      q,
      total,
      rows.map((u) => ({
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        platformRole: u.platformRole,
        status: u.status,
        emailVerified: u.emailVerifiedAt !== null,
        mfaEnabled: u.mfaEnabledAt !== null,
        organizations: u._count.memberships,
        createdAt: u.createdAt.toISOString(),
      })),
    );
  }

  async organizations(
    adminId: string,
    q: AdminListQuery,
  ): Promise<AdminPage<AdminOrganizationRow>> {
    const where: Prisma.OrganizationWhereInput = {
      ...(q.q ? { name: { contains: q.q, mode: 'insensitive' } } : {}),
      ...(ORG_STATUSES.includes(q.status as (typeof ORG_STATUSES)[number])
        ? { status: q.status as (typeof ORG_STATUSES)[number] }
        : {}),
      ...(q.status === 'to_review' ? { verifications: { some: { status: 'submitted' } } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.system.organization.count({ where }),
      this.system.organization.findMany({
        where,
        select: ORG_ROW_SELECT,
        orderBy: { createdAt: 'desc' },
        ...this.skip(q),
      }),
    ]);
    await this.trace(adminId, 'organizations', { filters: q });
    const counts = await this.orderCounts(rows.map((r) => r.id));
    return this.page(
      q,
      total,
      rows.map((r) => toOrgRow(r, counts)),
    );
  }

  async organization(adminId: string, id: string): Promise<AdminOrganizationDetail> {
    const o = await this.system.organization.findUnique({
      where: { id },
      select: {
        ...ORG_ROW_SELECT,
        description: true,
        phoneWhatsapp: true,
        verifiedAt: true,
        members: {
          where: { role: 'owner', status: 'active' },
          select: { user: { select: { displayName: true, email: true } } },
        },
        verifications: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            status: true,
            submittedAt: true,
            decidedAt: true,
            reason: true,
            documents: {
              select: {
                id: true,
                kind: true,
                file: { select: { originalName: true, sizeBytes: true } },
              },
              orderBy: { kind: 'asc' },
            },
          },
        },
      },
    });
    if (!o) throw new NotFoundException('Organisation introuvable.');
    await this.trace(adminId, 'organization', { entityId: id, organizationId: id });
    const v = o.verifications[0];
    return {
      ...toOrgRow(o, await this.orderCounts([o.id])),
      description: o.description,
      phoneWhatsapp: o.phoneWhatsapp,
      verifiedAt: o.verifiedAt?.toISOString() ?? null,
      owners: o.members.map((m) => m.user),
      verification: v
        ? {
            id: v.id,
            status: v.status,
            submittedAt: v.submittedAt?.toISOString() ?? null,
            decidedAt: v.decidedAt?.toISOString() ?? null,
            reason: v.reason,
            documents: v.documents.map((d) => ({
              id: d.id,
              kind: d.kind,
              originalName: d.file.originalName,
              sizeBytes: d.file.sizeBytes,
            })),
          }
        : null,
    };
  }

  /** Pièce justificative (RCCM, identité) : chaque ouverture est journalisée. */
  async verificationDocument(adminId: string, documentId: string) {
    const doc = await this.system.verificationDocument.findUnique({
      where: { id: documentId },
      select: {
        organizationId: true,
        kind: true,
        file: { select: { storageKey: true, mime: true, originalName: true } },
      },
    });
    if (!doc) throw new NotFoundException('Document introuvable.');
    await this.audit.recordSystem({
      actorUserId: adminId,
      actorRole: 'platform_admin',
      organizationId: doc.organizationId,
      action: 'admin.document_opened',
      entityType: 'verification_document',
      entityId: documentId,
      after: { kind: doc.kind },
    });
    return { ...doc.file, content: await this.files.read(doc.file.storageKey) };
  }

  async orders(adminId: string, q: AdminListQuery): Promise<AdminPage<AdminOrderRow>> {
    const where: Prisma.OrderWhereInput = {
      ...(q.q ? { number: { contains: q.q.toUpperCase() } } : {}),
      ...(q.organizationId ? { organizationId: q.organizationId } : {}),
    };
    const [total, rows] = await Promise.all([
      this.system.order.count({ where }),
      this.system.order.findMany({
        where,
        select: {
          id: true,
          number: true,
          status: true,
          paymentStatus: true,
          currency: true,
          finalAmount: true,
          createdAt: true,
          organizationId: true,
          orgCustomerId: true,
        },
        orderBy: { createdAt: 'desc' },
        ...this.skip(q),
      }),
    ]);
    const [orgs, customers] = await Promise.all([
      this.orgNames(rows.map((r) => r.organizationId)),
      this.system.orgCustomer.findMany({
        where: { id: { in: rows.map((r) => r.orgCustomerId) } },
        select: { id: true, fullName: true },
      }),
    ]);
    const cust = new Map(customers.map((c) => [c.id, c.fullName]));
    await this.trace(adminId, 'orders', { organizationId: q.organizationId, filters: q });
    return this.page(
      q,
      total,
      rows.map((o) => ({
        id: o.id,
        number: o.number,
        organizationName: orgs.get(o.organizationId) ?? '',
        customerName: cust.get(o.orgCustomerId) ?? '',
        status: o.status,
        paymentStatus: o.paymentStatus,
        currency: o.currency,
        finalAmount: Number(o.finalAmount),
        createdAt: o.createdAt.toISOString(),
      })),
    );
  }

  async payments(adminId: string, q: AdminListQuery): Promise<AdminPage<AdminPaymentRow>> {
    const where: Prisma.PaymentWhereInput = {
      ...(q.organizationId ? { organizationId: q.organizationId } : {}),
      ...(q.status === 'pending_verification' ? { status: 'pending_verification' } : {}),
    };
    const [total, rows] = await Promise.all([
      this.system.payment.count({ where }),
      this.system.payment.findMany({
        where,
        select: {
          id: true,
          kind: true,
          method: true,
          amount: true,
          currency: true,
          status: true,
          createdAt: true,
          organizationId: true,
          order: { select: { number: true } },
        },
        orderBy: { createdAt: 'desc' },
        ...this.skip(q),
      }),
    ]);
    const orgs = await this.orgNames(rows.map((r) => r.organizationId));
    await this.trace(adminId, 'payments', { organizationId: q.organizationId, filters: q });
    return this.page(
      q,
      total,
      rows.map((p) => ({
        id: p.id,
        orderNumber: p.order.number,
        organizationName: orgs.get(p.organizationId) ?? '',
        kind: p.kind,
        method: p.method,
        amount: Number(p.amount),
        currency: p.currency,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
      })),
    );
  }

  async parcels(adminId: string, q: AdminListQuery): Promise<AdminPage<AdminParcelRow>> {
    const where: Prisma.ParcelWhereInput = {
      ...(q.q ? { code: { contains: q.q.toUpperCase() } } : {}),
      ...(q.organizationId ? { organizationId: q.organizationId } : {}),
    };
    const [total, rows] = await Promise.all([
      this.system.parcel.count({ where }),
      this.system.parcel.findMany({
        where,
        select: {
          id: true,
          code: true,
          status: true,
          currentStepCode: true,
          createdAt: true,
          organizationId: true,
          items: { where: { removedAt: null }, select: { quantity: true } },
        },
        orderBy: { createdAt: 'desc' },
        ...this.skip(q),
      }),
    ]);
    const orgs = await this.orgNames(rows.map((r) => r.organizationId));
    await this.trace(adminId, 'parcels', { organizationId: q.organizationId, filters: q });
    return this.page(
      q,
      total,
      rows.map((p) => ({
        id: p.id,
        code: p.code,
        organizationName: orgs.get(p.organizationId) ?? '',
        status: p.status,
        currentStepCode: p.currentStepCode,
        items: p.items.reduce((n, i) => n + i.quantity, 0),
        createdAt: p.createdAt.toISOString(),
      })),
    );
  }

  async auditLog(adminId: string, q: AdminListQuery): Promise<AdminPage<AdminAuditRow>> {
    const where: Prisma.AuditLogWhereInput = {
      ...(q.organizationId ? { organizationId: q.organizationId } : {}),
      ...(q.q ? { action: { startsWith: q.q } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.system.auditLog.count({ where }),
      this.system.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...this.skip(q) }),
    ]);
    const [users, orgs] = await Promise.all([
      this.system.user.findMany({
        where: { id: { in: rows.map((r) => r.actorUserId).filter((x): x is string => !!x) } },
        select: { id: true, email: true },
      }),
      this.orgNames(rows.map((r) => r.organizationId).filter((x): x is string => !!x)),
    ]);
    const emails = new Map(users.map((u) => [u.id, u.email]));
    await this.trace(adminId, 'audit_logs', { organizationId: q.organizationId, filters: q });
    return this.page(
      q,
      total,
      rows.map((a) => ({
        id: a.id,
        createdAt: a.createdAt.toISOString(),
        actorEmail: a.actorUserId ? (emails.get(a.actorUserId) ?? null) : null,
        actorRole: a.actorRole,
        organizationName: a.organizationId ? (orgs.get(a.organizationId) ?? null) : null,
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        before: a.before,
        after: a.after,
        reason: a.reason,
      })),
    );
  }

  private async orderCounts(organizationIds: string[]) {
    const rows = await this.system.order.groupBy({
      by: ['organizationId'],
      where: { organizationId: { in: organizationIds } },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.organizationId, r._count._all]));
  }

  private async orgNames(ids: string[]) {
    const rows = await this.system.organization.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((o) => [o.id, o.name]));
  }
}

const ORG_ROW_SELECT = {
  id: true,
  name: true,
  slug: true,
  type: true,
  status: true,
  createdAt: true,
  verifications: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true } },
  _count: { select: { members: true } },
} as const satisfies Prisma.OrganizationSelect;

function toOrgRow(
  o: Prisma.OrganizationGetPayload<{ select: typeof ORG_ROW_SELECT }>,
  orders: Map<string, number>,
): AdminOrganizationRow {
  return {
    id: o.id,
    name: o.name,
    slug: o.slug,
    type: o.type,
    status: o.status,
    verificationStatus: o.verifications[0]?.status ?? null,
    members: o._count.members,
    orders: orders.get(o.id) ?? 0,
    createdAt: o.createdAt.toISOString(),
  };
}
