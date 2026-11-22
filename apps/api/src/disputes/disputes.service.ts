import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@konzia/db';
import type {
  AdminListQuery,
  AdminPage,
  DisputeCategory,
  DisputeInfo,
  DisputeMessageInput,
  DisputeStatus,
  OpenDisputeInput,
} from '@konzia/shared';
import { AuditService } from '../audit/audit.service';
import { FilesService, type UploadedBlob } from '../files/files.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import type { OrgContext } from '../tenancy/org-context';
import { TenantDb, type TenantTx } from '../tenancy/tenant-db.service';

type Side = { as: 'customer' } | { as: 'commissioner'; org: OrgContext } | { as: 'support' };

/**
 * Litiges (ticket #28, EF-100, EF-101). L'accès se vérifie par la RLS (client du litige,
 * propriétaire ou commercial du commissionnaire) ; les écritures passent par le chemin système,
 * journalisées. La base fige un litige clos (seule une réouverture motivée par l'administration).
 */
@Injectable()
export class DisputesService {
  constructor(
    private readonly db: TenantDb,
    private readonly system: PrismaService,
    private readonly files: FilesService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async uploadEvidence(userId: string, upload: UploadedBlob): Promise<{ fileId: string }> {
    const stored = await this.db.run(userId, (tx) =>
      this.files.store(tx, userId, null, 'dispute_evidence', upload),
    );
    return { fileId: stored.id };
  }

  async open(userId: string, orderId: string, input: OpenDisputeInput): Promise<DisputeInfo> {
    const order = await this.db.run(userId, (tx) =>
      tx.order.findFirst({
        where: { id: orderId, customerUserId: userId },
        select: { organizationId: true },
      }),
    );
    if (!order) throw new NotFoundException('Commande introuvable.');
    await this.assertOwnFiles(userId, input.fileIds);
    let id: string;
    try {
      id = await this.system.$transaction(async (tx) => {
        const d = await tx.dispute.create({
          data: {
            organizationId: order.organizationId,
            orderId,
            customerUserId: userId,
            category: input.category,
            description: input.description,
            messages: {
              create: {
                organizationId: order.organizationId,
                authorUserId: userId,
                authorRole: 'customer',
                body: input.description,
                fileIds: input.fileIds,
              },
            },
          },
          select: { id: true },
        });
        await this.audit.recordSystem(
          {
            actorUserId: userId,
            actorRole: 'customer',
            organizationId: order.organizationId,
            action: 'dispute.opened',
            entityType: 'dispute',
            entityId: d.id,
            after: { orderId, category: input.category },
          },
          tx,
        );
        return d.id;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
        throw new ConflictException('Un litige est déjà en cours pour cette commande.');
      throw err;
    }
    await this.notify(id, 'customer', 'opened');
    return this.read(id);
  }

  /** Message du client, du commissionnaire ou du support. La réponse du commissionnaire lance l'examen. */
  async addMessage(
    userId: string,
    disputeId: string,
    input: DisputeMessageInput,
    side: Side,
  ): Promise<DisputeInfo> {
    const d = await this.access(userId, disputeId, side);
    if (d.status === 'closed') throw new ConflictException('Ce litige est clos.');
    await this.assertOwnFiles(userId, input.fileIds);
    await this.system.$transaction(async (tx) => {
      await tx.disputeMessage.create({
        data: {
          disputeId,
          organizationId: d.organizationId,
          authorUserId: userId,
          authorRole: side.as,
          body: input.body,
          fileIds: input.fileIds,
        },
        select: { id: true },
      });
      if (side.as === 'commissioner' && d.status === 'awaiting_commissioner')
        await tx.dispute.update({ where: { id: disputeId }, data: { status: 'under_review' } });
      await this.audit.recordSystem(
        {
          actorUserId: userId,
          actorRole:
            side.as === 'commissioner'
              ? side.org.role
              : side.as === 'support'
                ? 'platform_admin'
                : 'customer',
          organizationId: d.organizationId,
          action: 'dispute.message_added',
          entityType: 'dispute',
          entityId: disputeId,
          after: { files: input.fileIds.length },
        },
        tx,
      );
    });
    await this.notify(disputeId, side.as, 'message');
    return this.read(disputeId);
  }

  // --- Administration (support) ------------------------------------------------------

  async resolve(adminId: string, disputeId: string, resolution: string): Promise<DisputeInfo> {
    await this.transition(adminId, disputeId, 'resolve', resolution, (d) => {
      if (d.status === 'resolved' || d.status === 'closed')
        throw new ConflictException('Une décision a déjà été rendue.');
      return { status: 'resolved', resolution, resolvedBy: adminId, resolvedAt: new Date() };
    });
    await this.notify(disputeId, 'support', 'resolved');
    return this.read(disputeId);
  }

  async close(adminId: string, disputeId: string): Promise<DisputeInfo> {
    await this.transition(adminId, disputeId, 'close', null, (d) => {
      if (d.status !== 'resolved')
        throw new ConflictException('Rendez d’abord une décision avant de clore.');
      return { status: 'closed', closedAt: new Date() };
    });
    await this.notify(disputeId, 'support', 'closed');
    return this.read(disputeId);
  }

  async reopen(adminId: string, disputeId: string, reason: string): Promise<DisputeInfo> {
    await this.transition(adminId, disputeId, 'reopen', reason, (d) => {
      if (d.status !== 'closed')
        throw new ConflictException('Seul un litige clos peut être rouvert.');
      return {
        status: 'under_review',
        reopenedAt: new Date(),
        reopenReason: reason,
        closedAt: null,
      };
    });
    await this.notify(disputeId, 'support', 'reopened');
    return this.read(disputeId);
  }

  private async transition(
    adminId: string,
    disputeId: string,
    verb: 'resolve' | 'close' | 'reopen',
    reason: string | null,
    next: (d: { status: DisputeStatus }) => Prisma.DisputeUpdateInput,
  ) {
    await this.system.$transaction(async (tx) => {
      const d = await tx.dispute.findUnique({
        where: { id: disputeId },
        select: { status: true, organizationId: true },
      });
      if (!d) throw new NotFoundException('Litige introuvable.');
      const data = next(d);
      await tx.dispute.update({ where: { id: disputeId }, data });
      await this.audit.recordSystem(
        {
          actorUserId: adminId,
          actorRole: 'platform_admin',
          organizationId: d.organizationId,
          action: `dispute.${verb === 'close' ? 'closed' : verb === 'resolve' ? 'resolved' : 'reopened'}`,
          entityType: 'dispute',
          entityId: disputeId,
          before: { status: d.status },
          after: { status: data.status as string },
          reason,
        },
        tx,
      );
    });
  }

  async adminList(adminId: string, q: AdminListQuery): Promise<AdminPage<DisputeInfo>> {
    const where: Prisma.DisputeWhereInput = {
      ...(q.status === 'open' ? { status: { in: ['awaiting_commissioner', 'under_review'] } } : {}),
      ...(q.organizationId ? { organizationId: q.organizationId } : {}),
    };
    const [total, rows] = await Promise.all([
      this.system.dispute.count({ where }),
      this.system.dispute.findMany({
        where,
        select: { id: true },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    await this.audit.recordSystem({
      actorUserId: adminId,
      actorRole: 'platform_admin',
      organizationId: q.organizationId ?? null,
      action: 'admin.read',
      entityType: 'disputes',
      after: q as unknown as Prisma.InputJsonValue,
    });
    const items = [];
    for (const r of rows) items.push(await this.read(r.id));
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  async adminGet(adminId: string, disputeId: string): Promise<DisputeInfo> {
    const info = await this.read(disputeId);
    const d = await this.system.dispute.findUniqueOrThrow({
      where: { id: disputeId },
      select: { organizationId: true },
    });
    await this.audit.recordSystem({
      actorUserId: adminId,
      actorRole: 'platform_admin',
      organizationId: d.organizationId,
      action: 'admin.read',
      entityType: 'dispute',
      entityId: disputeId,
    });
    return info;
  }

  // --- Lectures --------------------------------------------------------------------------

  listForCustomer(userId: string): Promise<DisputeInfo[]> {
    return this.listVisible(userId, { customerUserId: userId });
  }

  listForOrg(userId: string, org: OrgContext): Promise<DisputeInfo[]> {
    return this.listVisible(userId, { organizationId: org.organizationId });
  }

  async get(userId: string, disputeId: string, side: Side): Promise<DisputeInfo> {
    await this.access(userId, disputeId, side);
    return this.read(disputeId);
  }

  /** Pièce jointe d'un litige : accessible aux seules parties du litige (et au support). */
  async file(userId: string, disputeId: string, fileId: string, side: Side) {
    if (side.as !== 'support') await this.access(userId, disputeId, side);
    const used = await this.system.disputeMessage.count({
      where: { disputeId, fileIds: { has: fileId } },
    });
    if (used === 0) throw new NotFoundException('Pièce introuvable.');
    const f = await this.system.storedFile.findUniqueOrThrow({
      where: { id: fileId },
      select: { storageKey: true, mime: true, originalName: true },
    });
    return { ...f, content: await this.files.read(f.storageKey) };
  }

  private async listVisible(userId: string, where: Prisma.DisputeWhereInput) {
    const ids = await this.db.run(userId, (tx) =>
      tx.dispute.findMany({
        where,
        select: { id: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    );
    const out: DisputeInfo[] = [];
    for (const r of ids) out.push(await this.read(r.id));
    return out;
  }

  /** Vérifie l'accès par la RLS (client ou propriétaire/commercial de l'organisation). */
  private async access(userId: string, disputeId: string, side: Side) {
    const where: Prisma.DisputeWhereInput =
      side.as === 'customer'
        ? { id: disputeId, customerUserId: userId }
        : side.as === 'commissioner'
          ? { id: disputeId, organizationId: side.org.organizationId }
          : { id: disputeId };
    const select = { status: true, organizationId: true } as const;
    const d =
      side.as === 'support'
        ? await this.system.dispute.findFirst({ where, select })
        : await this.db.run(userId, (tx: TenantTx) => tx.dispute.findFirst({ where, select }));
    if (!d) throw new NotFoundException('Litige introuvable.');
    return d;
  }

  private async assertOwnFiles(userId: string, ids: string[]) {
    if (ids.length === 0) return;
    const n = await this.system.storedFile.count({
      where: { id: { in: ids }, ownerUserId: userId, purpose: 'dispute_evidence' },
    });
    if (n !== new Set(ids).size) throw new BadRequestException('Pièce jointe introuvable.');
  }

  /** Lecture complète (chemin système, après contrôle d'accès). */
  private async read(disputeId: string): Promise<DisputeInfo> {
    const d = await this.system.dispute.findUnique({
      where: { id: disputeId },
      select: {
        id: true,
        orderId: true,
        organizationId: true,
        category: true,
        description: true,
        status: true,
        resolution: true,
        reopenReason: true,
        createdAt: true,
        resolvedAt: true,
        closedAt: true,
        messages: {
          select: {
            id: true,
            authorUserId: true,
            authorRole: true,
            body: true,
            fileIds: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!d) throw new NotFoundException('Litige introuvable.');
    const [order, org, authors, files] = await Promise.all([
      this.system.order.findUniqueOrThrow({
        where: { id: d.orderId },
        select: { number: true, orgCustomerId: true },
      }),
      this.system.organization.findUniqueOrThrow({
        where: { id: d.organizationId },
        select: { name: true },
      }),
      this.system.user.findMany({
        where: { id: { in: d.messages.map((m) => m.authorUserId) } },
        select: { id: true, displayName: true },
      }),
      this.system.storedFile.findMany({
        where: { id: { in: d.messages.flatMap((m) => m.fileIds) } },
        select: { id: true, originalName: true },
      }),
    ]);
    const customer = await this.system.orgCustomer.findUnique({
      where: { id: order.orgCustomerId },
      select: { fullName: true },
    });
    const names = new Map(authors.map((a) => [a.id, a.displayName]));
    const fileNames = new Map(files.map((f) => [f.id, f.originalName]));
    return {
      id: d.id,
      orderId: d.orderId,
      orderNumber: order.number,
      organizationName: org.name,
      customerName: customer?.fullName ?? '',
      category: d.category as DisputeCategory,
      description: d.description,
      status: d.status,
      resolution: d.resolution,
      reopenReason: d.reopenReason,
      createdAt: d.createdAt.toISOString(),
      resolvedAt: d.resolvedAt?.toISOString() ?? null,
      closedAt: d.closedAt?.toISOString() ?? null,
      messages: d.messages.map((m) => ({
        id: m.id,
        authorRole: m.authorRole as DisputeInfo['messages'][number]['authorRole'],
        // Le support signe « Support Konzia » : pas de nom d'agent exposé.
        authorName:
          m.authorRole === 'support'
            ? 'Support Konzia'
            : m.authorRole === 'commissioner'
              ? `${names.get(m.authorUserId) ?? ''} (${org.name})`
              : (names.get(m.authorUserId) ?? ''),
        body: m.body,
        files: m.fileIds.map((id) => ({ id, name: fileNames.get(id) ?? 'pièce' })),
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  private notify(
    disputeId: string,
    actor: Side['as'],
    what: 'opened' | 'message' | 'resolved' | 'closed' | 'reopened',
  ) {
    return this.notifications.emit({ kind: 'dispute_updated', disputeId, actor, what });
  }
}
