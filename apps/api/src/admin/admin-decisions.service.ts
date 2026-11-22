import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

type OrgDecision = 'approve' | 'reject' | 'suspend' | 'reactivate';
const PAST = {
  approve: 'approved',
  reject: 'rejected',
  suspend: 'suspended',
  reactivate: 'reactivated',
} as const;

/**
 * Décisions d'administration (ticket #27, EF-104) : toujours motivées (sauf approbation),
 * journalisées avec l'état avant/après, et notifiées aux responsables concernés.
 */
@Injectable()
export class AdminDecisionsService {
  constructor(
    private readonly system: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async decideOrganization(
    adminId: string,
    organizationId: string,
    decision: OrgDecision,
    reason: string | null,
  ): Promise<void> {
    if (decision !== 'approve' && !reason) throw new BadRequestException('Motif obligatoire.');
    await this.system.$transaction(async (tx) => {
      const org = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { status: true },
      });
      if (!org) throw new NotFoundException('Organisation introuvable.');
      const pending = await tx.organizationVerification.findFirst({
        where: { organizationId, status: 'submitted' },
        select: { id: true },
      });
      let next = org.status;
      switch (decision) {
        case 'approve':
        case 'reject':
          if (!pending)
            throw new ConflictException('Aucun dossier de vérification soumis à examiner.');
          if (org.status === 'suspended')
            throw new ConflictException('Activité suspendue : réactivez-la d’abord.');
          await tx.organizationVerification.update({
            where: { id: pending.id },
            data: {
              status: decision === 'approve' ? 'approved' : 'rejected',
              decidedAt: new Date(),
              decidedBy: adminId,
              reason,
            },
          });
          next = decision === 'approve' ? 'approved' : 'rejected';
          await tx.organization.update({
            where: { id: organizationId },
            data: { status: next, ...(decision === 'approve' ? { verifiedAt: new Date() } : {}) },
          });
          break;
        case 'suspend':
          if (org.status === 'suspended') throw new ConflictException('Déjà suspendue.');
          next = 'suspended';
          await tx.organization.update({ where: { id: organizationId }, data: { status: next } });
          break;
        case 'reactivate':
          if (org.status !== 'suspended')
            throw new ConflictException('Cette activité n’est pas suspendue.');
          // Retour au dernier statut de vérification connu.
          next = (await tx.organizationVerification.findFirst({
            where: { organizationId, status: 'approved' },
            select: { id: true },
          }))
            ? 'approved'
            : 'pending';
          await tx.organization.update({ where: { id: organizationId }, data: { status: next } });
          break;
      }
      await this.audit.recordSystem(
        {
          actorUserId: adminId,
          actorRole: 'platform_admin',
          organizationId,
          action: `admin.organization_${PAST[decision]}`,
          entityType: 'organization',
          entityId: organizationId,
          before: { status: org.status },
          after: { status: next },
          reason,
        },
        tx,
      );
    });
    await this.notifications.emit({
      kind: 'organization_status',
      organizationId,
      decision: PAST[decision],
      reason,
    });
  }

  /** Suspension d'un compte : connexion impossible et toutes ses sessions révoquées sur-le-champ. */
  async decideUser(
    adminId: string,
    userId: string,
    decision: 'suspend' | 'reactivate',
    reason: string,
  ): Promise<void> {
    if (userId === adminId)
      throw new BadRequestException('Vous ne pouvez pas vous suspendre vous-même.');
    await this.system.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { status: true } });
      if (!user) throw new NotFoundException('Utilisateur introuvable.');
      const next = decision === 'suspend' ? 'suspended' : 'active';
      if (user.status === next) throw new ConflictException('Aucun changement.');
      await tx.user.update({ where: { id: userId }, data: { status: next } });
      if (decision === 'suspend')
        await tx.session.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      await this.audit.recordSystem(
        {
          actorUserId: adminId,
          actorRole: 'platform_admin',
          action: decision === 'suspend' ? 'admin.user_suspended' : 'admin.user_reactivated',
          entityType: 'user',
          entityId: userId,
          before: { status: user.status },
          after: { status: next },
          reason,
        },
        tx,
      );
    });
  }
}
