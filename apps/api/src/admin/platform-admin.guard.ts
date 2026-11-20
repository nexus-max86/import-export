import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Réservé aux administrateurs de la plateforme.
 * La MFA obligatoire sera ajoutée à cette garde au ticket #27 (EF-04).
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const userId = context.switchToHttp().getRequest<Request>().auth?.userId;
    const user = userId
      ? await this.prisma.user.findUnique({
          where: { id: userId },
          select: { platformRole: true, status: true },
        })
      : null;
    if (user?.platformRole !== 'admin' || user.status !== 'active') {
      throw new ForbiddenException('Réservé à l’administration Konzia.');
    }
    return true;
  }
}

export const PlatformAdmin = () => UseGuards(PlatformAdminGuard);
