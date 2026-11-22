import {
  BadRequestException,
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UseGuards,
  applyDecorators,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { can, ORG_HEADER, type OrgRole, type Permission } from '@konzia/shared';
import type { Request } from 'express';
import { TenantDb } from './tenant-db.service';

export interface OrgContext {
  organizationId: string;
  role: OrgRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Organisation active, vérifiée par OrgGuard. */
      org?: OrgContext;
    }
  }
}

const PERMISSION = 'orgPermission';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Vérifie que l'utilisateur est membre actif de l'organisation de l'en-tête, avec la permission requise. */
@Injectable()
export class OrgGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: TenantDb,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const orgId = req.get(ORG_HEADER);
    if (!orgId || !UUID.test(orgId)) {
      throw new BadRequestException('Choisissez l’organisation au nom de laquelle vous agissez.');
    }
    const userId = req.auth?.userId;
    if (!userId) throw new ForbiddenException();

    const member = await this.db.run(userId, (tx) =>
      tx.organizationMember.findFirst({
        where: { organizationId: orgId, userId, status: 'active' },
        select: { role: true, organization: { select: { status: true } } },
      }),
    );
    // Même réponse qu'il s'agisse d'une autre organisation ou d'une organisation inexistante.
    if (!member) throw new ForbiddenException('Accès refusé à cette organisation.');

    // Activité suspendue par l'administration : consultation seulement, aucune action.
    if (member.organization.status === 'suspended' && req.method !== 'GET') {
      throw new ForbiddenException(
        'Votre activité est suspendue par Konzia : aucune action n’est possible pour le moment.',
      );
    }

    const permission = this.reflector.get<Permission | undefined>(PERMISSION, context.getHandler());
    if (permission && !can(member.role, permission)) {
      throw new ForbiddenException('Votre rôle ne permet pas cette action.');
    }
    req.org = { organizationId: orgId, role: member.role };
    return true;
  }
}

/** Route agissant au nom d'une organisation ; `permission` facultative (membre suffit sinon). */
export const ForOrg = (permission?: Permission) =>
  applyDecorators(SetMetadata(PERMISSION, permission), UseGuards(OrgGuard));

export const Org = createParamDecorator((_data: unknown, ctx: ExecutionContext): OrgContext => {
  const org = ctx.switchToHttp().getRequest<Request>().org;
  if (!org) throw new Error('Contexte d’organisation absent : ajoutez @ForOrg().');
  return org;
});
