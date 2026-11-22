import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { isFresh } from '../auth/mfa.service';
import { PrismaService } from '../prisma/prisma.service';

export const MFA_REQUIRED_MESSAGE =
  'Double authentification requise pour l’administration : activez-la ou saisissez votre code.';

/**
 * Réservé aux administrateurs de la plateforme, avec double authentification (EF-04) :
 * activée sur le compte ET validée pour cette session depuis moins de 12 heures.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const auth = context.switchToHttp().getRequest<Request>().auth;
    const user = auth
      ? await this.prisma.user.findUnique({
          where: { id: auth.userId },
          select: { platformRole: true, status: true, mfaEnabledAt: true },
        })
      : null;
    if (user?.platformRole !== 'admin' || user.status !== 'active') {
      throw new ForbiddenException('Réservé à l’administration Konzia.');
    }
    const session = await this.prisma.session.findUnique({
      where: { id: auth!.sessionId },
      select: { mfaVerifiedAt: true },
    });
    if (!user.mfaEnabledAt || !isFresh(session?.mfaVerifiedAt ?? null)) {
      throw new ForbiddenException(MFA_REQUIRED_MESSAGE);
    }
    return true;
  }
}

export const PlatformAdmin = () => UseGuards(PlatformAdminGuard);
