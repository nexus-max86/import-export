import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ORG_ROLE_LABELS,
  type CreateOrganizationInput,
  type InviteMemberInput,
  type MemberInfo,
  type MembershipSummary,
  type OrgRole,
  type UpdateOrganizationInput,
} from '@konzia/shared';
import { randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { randomToken, sha256 } from '../common/crypto';
import { EMAIL_SENDER, type EmailSender } from '../email/email-sender';
import { invitationMessage } from '../email/templates';
import { PrismaService } from '../prisma/prisma.service';
import type { OrgContext } from '../tenancy/org-context';
import { TenantDb, type TenantTx } from '../tenancy/tenant-db.service';

const INVITATION_TTL_MS = 7 * 86_400_000;

function slugify(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${base || 'commissionnaire'}-${randomBytes(3).toString('hex')}`;
}

@Injectable()
export class OrganizationsService {
  constructor(
    /** Rôle système : uniquement pour créer une organisation et accepter une invitation. */
    private readonly system: PrismaService,
    private readonly db: TenantDb,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
    @Inject(ENV) private readonly env: Env,
    private readonly audit: AuditService,
  ) {}

  /** Création = amorçage : l'organisation et son propriétaire sont créés ensemble par le rôle système. */
  async create(userId: string, input: CreateOrganizationInput): Promise<MembershipSummary> {
    const org = await this.system.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          name: input.name,
          type: input.type,
          description: input.description ?? null,
          phoneWhatsapp: input.phoneWhatsapp ?? null,
          slug: slugify(input.name),
          members: { create: { userId, role: 'owner' } },
        },
      });
      await this.audit.recordSystem(
        {
          actorUserId: userId,
          actorRole: 'self',
          organizationId: created.id,
          action: 'org.created',
          entityType: 'organization',
          entityId: created.id,
          after: { name: created.name, type: created.type, status: created.status },
        },
        tx,
      );
      return created;
    });
    return { organizationId: org.id, name: org.name, status: org.status, role: 'owner' };
  }

  mine(userId: string): Promise<MembershipSummary[]> {
    return this.db.run(userId, async (tx) => {
      const rows = await tx.organizationMember.findMany({
        where: { userId, status: 'active' },
        select: { role: true, organization: { select: { id: true, name: true, status: true } } },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map((r) => ({
        organizationId: r.organization.id,
        name: r.organization.name,
        status: r.organization.status,
        role: r.role,
      }));
    });
  }

  get(userId: string, org: OrgContext) {
    return this.db.run(userId, (tx) =>
      tx.organization.findUniqueOrThrow({
        where: { id: org.organizationId },
        select: {
          id: true,
          type: true,
          name: true,
          slug: true,
          description: true,
          phoneWhatsapp: true,
          status: true,
          isPlatformOperated: true,
          marketplaces: true,
          transportModes: true,
          pricingPolicy: true,
        },
      }),
    );
  }

  async update(userId: string, org: OrgContext, input: UpdateOrganizationInput): Promise<void> {
    await this.db.run(userId, async (tx) => {
      const fields = {
        name: true,
        description: true,
        phoneWhatsapp: true,
        marketplaces: true,
        transportModes: true,
        pricingPolicy: true,
      } as const;
      const before = await tx.organization.findUniqueOrThrow({
        where: { id: org.organizationId },
        select: fields,
      });
      const after = await tx.organization.update({
        where: { id: org.organizationId },
        data: input,
        select: fields,
      });
      await this.audit.record(tx, {
        actorUserId: userId,
        actorRole: org.role,
        organizationId: org.organizationId,
        action: 'org.updated',
        entityType: 'organization',
        entityId: org.organizationId,
        before,
        after,
      });
    });
  }

  members(userId: string, org: OrgContext): Promise<MemberInfo[]> {
    return this.db.run(userId, async (tx) => {
      const rows = await tx.organizationMember.findMany({
        where: { organizationId: org.organizationId, status: 'active' },
        select: {
          id: true,
          role: true,
          user: { select: { id: true, displayName: true, email: true } },
        },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map((r) => ({
        id: r.id,
        userId: r.user.id,
        displayName: r.user.displayName,
        email: r.user.email,
        role: r.role,
      }));
    });
  }

  async invite(userId: string, org: OrgContext, input: InviteMemberInput): Promise<void> {
    const token = randomToken();
    const orgName = await this.db.run(userId, async (tx) => {
      const already = await tx.organizationMember.findFirst({
        where: {
          organizationId: org.organizationId,
          status: 'active',
          user: { email: input.email },
        },
        select: { id: true },
      });
      if (already) throw new ConflictException('Cette personne fait déjà partie de l’équipe.');
      await tx.invitation.updateMany({
        where: {
          organizationId: org.organizationId,
          email: input.email,
          acceptedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      const invitation = await tx.invitation.create({
        data: {
          organizationId: org.organizationId,
          email: input.email,
          role: input.role,
          tokenHash: sha256(token),
          invitedBy: userId,
          expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        },
        select: { id: true },
      });
      await this.audit.record(tx, {
        actorUserId: userId,
        actorRole: org.role,
        organizationId: org.organizationId,
        action: 'org.member.invited',
        entityType: 'invitation',
        entityId: invitation.id,
        after: { email: input.email, role: input.role },
      });
      const o = await tx.organization.findUniqueOrThrow({
        where: { id: org.organizationId },
        select: { name: true },
      });
      return o.name;
    });
    await this.email.send(
      invitationMessage(
        input.email,
        orgName,
        ORG_ROLE_LABELS[input.role],
        `${this.env.APP_URL}/invitation?jeton=${token}`,
      ),
    );
  }

  /** L'invité n'est pas encore membre : la RLS ne lui montre pas l'invitation, d'où le rôle système. */
  async acceptInvitation(userId: string, token: string): Promise<MembershipSummary> {
    return this.system.$transaction(async (tx) => {
      const invitation = await tx.invitation.findUnique({
        where: { tokenHash: sha256(token) },
        include: { organization: true },
      });
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (
        !invitation ||
        invitation.acceptedAt ||
        invitation.revokedAt ||
        invitation.expiresAt <= new Date()
      ) {
        throw new BadRequestException(
          'Cette invitation n’est plus valable. Demandez-en une nouvelle.',
        );
      }
      if (invitation.email !== user.email) {
        throw new ForbiddenException(
          'Cette invitation a été envoyée à une autre adresse e-mail. Connectez-vous avec cette adresse.',
        );
      }
      await tx.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: invitation.organizationId, userId } },
        create: { organizationId: invitation.organizationId, userId, role: invitation.role },
        update: { role: invitation.role, status: 'active' },
      });
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });
      await this.audit.recordSystem(
        {
          actorUserId: userId,
          actorRole: 'self',
          organizationId: invitation.organizationId,
          action: 'org.member.joined',
          entityType: 'invitation',
          entityId: invitation.id,
          after: { role: invitation.role },
        },
        tx,
      );
      return {
        organizationId: invitation.organizationId,
        name: invitation.organization.name,
        status: invitation.organization.status,
        role: invitation.role,
      };
    });
  }

  async changeRole(
    userId: string,
    org: OrgContext,
    memberId: string,
    role: OrgRole,
  ): Promise<void> {
    await this.db.run(userId, async (tx) => {
      const member = await this.findMember(tx, org, memberId);
      if (member.role === 'owner' && role !== 'owner') await this.assertNotLastOwner(tx, org);
      await tx.organizationMember.update({
        where: { id: member.id },
        data: { role },
        select: { id: true },
      });
      await this.audit.record(tx, {
        actorUserId: userId,
        actorRole: org.role,
        organizationId: org.organizationId,
        action: 'org.member.role_changed',
        entityType: 'organization_member',
        entityId: member.id,
        before: { role: member.role },
        after: { role },
      });
    });
  }

  async removeMember(userId: string, org: OrgContext, memberId: string): Promise<void> {
    await this.db.run(userId, async (tx) => {
      const member = await this.findMember(tx, org, memberId);
      if (member.role === 'owner') await this.assertNotLastOwner(tx, org);
      await tx.organizationMember.update({
        where: { id: member.id },
        data: { status: 'removed' },
        select: { id: true },
      });
      await this.audit.record(tx, {
        actorUserId: userId,
        actorRole: org.role,
        organizationId: org.organizationId,
        action: 'org.member.removed',
        entityType: 'organization_member',
        entityId: member.id,
        before: { role: member.role, status: 'active' },
        after: { status: 'removed' },
      });
    });
  }

  private async findMember(tx: TenantTx, org: OrgContext, memberId: string) {
    const member = await tx.organizationMember.findFirst({
      where: { id: memberId, organizationId: org.organizationId, status: 'active' },
      select: { id: true, role: true },
    });
    if (!member) throw new NotFoundException('Membre introuvable.');
    return member;
  }

  private async assertNotLastOwner(tx: TenantTx, org: OrgContext): Promise<void> {
    const owners = await tx.organizationMember.count({
      where: { organizationId: org.organizationId, role: 'owner', status: 'active' },
    });
    if (owners <= 1) {
      throw new ConflictException('L’organisation doit garder au moins un propriétaire.');
    }
  }
}
