import { Inject, Injectable } from '@nestjs/common';
import type { SessionInfo } from '@konzia/shared';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { randomToken, saltedHash, sha256 } from '../common/crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthContext } from './auth.types';

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Crée une session et renvoie le jeton à placer dans le cookie (jamais stocké en clair). */
  async create(
    userId: string,
    userAgent?: string,
    ip?: string,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = randomToken();
    const expiresAt = new Date(Date.now() + this.env.SESSION_TTL_DAYS * 86_400_000);
    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: sha256(token),
        userAgent: userAgent?.slice(0, 300) ?? null,
        ipHash: ip ? saltedHash(ip, this.env.HASH_SALT) : null,
        expiresAt,
      },
    });
    return { token, expiresAt };
  }

  /** Résout un jeton de cookie en contexte d'authentification, ou null s'il n'est plus valide. */
  async resolve(token: string): Promise<AuthContext | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: { select: { status: true } } },
    });
    const now = new Date();
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.user.status !== 'active'
    ) {
      return null;
    }
    if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: now } });
    }
    return { userId: session.userId, sessionId: session.id };
  }

  async revoke(userId: string, sessionId: string): Promise<boolean> {
    const { count } = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count > 0;
  }

  async revokeAll(userId: string): Promise<number> {
    const { count } = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count;
  }

  async list(auth: AuthContext): Promise<SessionInfo[]> {
    const sessions = await this.prisma.session.findMany({
      where: { userId: auth.userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
    });
    return sessions.map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      current: s.id === auth.sessionId,
    }));
  }
}
