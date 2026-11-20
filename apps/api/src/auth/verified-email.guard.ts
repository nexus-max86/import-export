import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

/** Exige une adresse e-mail confirmée (EF-01). */
@Injectable()
export class VerifiedEmailGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const userId = context.switchToHttp().getRequest<Request>().auth?.userId;
    const user = userId
      ? await this.prisma.user.findUnique({
          where: { id: userId },
          select: { emailVerifiedAt: true },
        })
      : null;
    if (!user?.emailVerifiedAt) {
      throw new ForbiddenException('Confirmez d’abord votre adresse e-mail.');
    }
    return true;
  }
}

export const RequireVerifiedEmail = () => UseGuards(VerifiedEmailGuard);
