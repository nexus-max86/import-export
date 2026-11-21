import { Injectable } from '@nestjs/common';
import { Prisma } from '@konzia/db';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantTx } from '../tenancy/tenant-db.service';

export interface AuditEntry {
  actorUserId: string | null;
  /** Rôle sous lequel l'acteur agit : rôle d'organisation, `platform_admin`, `self` ou `system`. */
  actorRole: string;
  organizationId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  reason?: string | null;
}

/**
 * Journal d'audit (EF-105). Toujours écrit DANS la transaction de la modification :
 * pas de changement sans trace, pas de trace sans changement.
 */
@Injectable()
export class AuditService {
  constructor(private readonly system: PrismaService) {}

  /** Entrée écrite par le rôle applicatif (RLS : en son propre nom, dans ses organisations). */
  async record(tx: TenantTx, entry: AuditEntry): Promise<void> {
    // Sans RETURNING : seuls les propriétaires lisent le journal, les autres rôles y écrivent quand même.
    await tx.auditLog.createMany({ data: [toData(entry)] });
  }

  /** Entrée écrite par un chemin système (authentification, amorçage, administration). */
  async recordSystem(entry: AuditEntry, tx?: Prisma.TransactionClient): Promise<void> {
    await (tx ?? this.system).auditLog.create({ data: toData(entry), select: { id: true } });
  }
}

function toData(entry: AuditEntry): Prisma.AuditLogUncheckedCreateInput {
  return {
    actorUserId: entry.actorUserId,
    actorRole: entry.actorRole,
    organizationId: entry.organizationId ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    before: entry.before ?? Prisma.JsonNull,
    after: entry.after ?? Prisma.JsonNull,
    reason: entry.reason ?? null,
  };
}
