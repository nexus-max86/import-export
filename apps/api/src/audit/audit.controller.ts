import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { Auth } from '../auth/decorators';
import { ForOrg, Org, type OrgContext } from '../tenancy/org-context';
import { TenantDb } from '../tenancy/tenant-db.service';

const PAGE_SIZE = 50;

export interface AuditItem {
  id: string;
  actorUserId: string | null;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  createdAt: Date;
}
const UUID = /^[0-9a-f-]{36}$/i;

@Controller('org/audit')
export class AuditController {
  constructor(private readonly db: TenantDb) {}

  /** Journal de l'organisation, du plus récent au plus ancien, paginé par curseur. */
  @Get()
  @ForOrg('audit.view_own_org')
  async list(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Query('apres') cursor?: string,
  ): Promise<{ items: AuditItem[]; next: string | null }> {
    if (cursor && !UUID.test(cursor)) throw new BadRequestException('Curseur invalide.');
    const rows = await this.db.run(auth.userId, (tx) =>
      tx.auditLog.findMany({
        where: { organizationId: org.organizationId },
        orderBy: { id: 'desc' },
        take: PAGE_SIZE + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          actorUserId: true,
          actorRole: true,
          action: true,
          entityType: true,
          entityId: true,
          before: true,
          after: true,
          reason: true,
          createdAt: true,
        },
      }),
    );
    const items = rows.slice(0, PAGE_SIZE);
    return { items, next: rows.length > PAGE_SIZE ? (items.at(-1)?.id ?? null) : null };
  }
}
