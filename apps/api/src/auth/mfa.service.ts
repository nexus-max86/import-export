import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { RateLimitService } from '../common/rate-limit.service';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { FileCrypto } from '../files/file-crypto';
import { PrismaService } from '../prisma/prisma.service';
import { generateSecret, otpauthUrl, verifyTotp } from './totp';

/** Validité d'une vérification MFA pour une session d'administration. */
export const MFA_SESSION_TTL_MS = 12 * 3_600_000;

/**
 * Double authentification TOTP (ticket #27, EF-04) : obligatoire pour l'administration.
 * Le secret est chiffré (AES-256-GCM) ; un code ne sert qu'une fois ; essais limités.
 */
@Injectable()
export class MfaService {
  private readonly crypto: FileCrypto;

  constructor(
    @Inject(ENV) env: Env,
    private readonly system: PrismaService,
    private readonly audit: AuditService,
    private readonly rateLimit: RateLimitService,
  ) {
    this.crypto = new FileCrypto(env.FILES_ENCRYPTION_KEY);
  }

  async status(userId: string, sessionId: string) {
    const [user, session] = await Promise.all([
      this.system.user.findUniqueOrThrow({
        where: { id: userId },
        select: { mfaEnabledAt: true },
      }),
      this.system.session.findUnique({ where: { id: sessionId }, select: { mfaVerifiedAt: true } }),
    ]);
    return {
      enabled: user.mfaEnabledAt !== null,
      verified: isFresh(session?.mfaVerifiedAt ?? null),
    };
  }

  /** Nouveau secret (tant que la MFA n'est pas activée) : à saisir dans l'application d'authentification. */
  async setup(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.system.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, mfaEnabledAt: true },
    });
    if (user.mfaEnabledAt)
      throw new ConflictException('La double authentification est déjà active.');
    const secret = generateSecret();
    await this.system.user.update({
      where: { id: userId },
      data: { mfaSecretEnc: this.seal(secret), mfaLastStep: null },
    });
    return { secret, otpauthUrl: otpauthUrl(secret, user.email) };
  }

  async enable(userId: string, sessionId: string, code: string): Promise<void> {
    await this.rateLimit.assertBelow(`mfa:${userId}`, 5);
    const user = await this.system.user.findUniqueOrThrow({
      where: { id: userId },
      select: { mfaSecretEnc: true, mfaEnabledAt: true },
    });
    if (user.mfaEnabledAt)
      throw new ConflictException('La double authentification est déjà active.');
    if (!user.mfaSecretEnc) throw new BadRequestException('Commencez par générer une clé.');
    const step = verifyTotp(this.open(user.mfaSecretEnc), code);
    if (step === null)
      return this.failed(userId, 'Code incorrect. Vérifiez l’heure de votre téléphone.');
    await this.system.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { mfaEnabledAt: new Date(), mfaLastStep: BigInt(step) },
      });
      await tx.session.update({ where: { id: sessionId }, data: { mfaVerifiedAt: new Date() } });
      await this.audit.recordSystem(
        {
          actorUserId: userId,
          actorRole: 'self',
          action: 'auth.mfa_enabled',
          entityType: 'user',
          entityId: userId,
        },
        tx,
      );
    });
  }

  async verify(userId: string, sessionId: string, code: string): Promise<void> {
    await this.rateLimit.assertBelow(`mfa:${userId}`, 5);
    const user = await this.system.user.findUniqueOrThrow({
      where: { id: userId },
      select: { mfaSecretEnc: true, mfaEnabledAt: true, mfaLastStep: true },
    });
    if (!user.mfaEnabledAt || !user.mfaSecretEnc)
      throw new BadRequestException('Activez d’abord la double authentification.');
    const step = verifyTotp(this.open(user.mfaSecretEnc), code, Date.now(), user.mfaLastStep);
    if (step === null) return this.failed(userId, 'Code incorrect ou déjà utilisé.');
    await this.system.$transaction(async (tx) => {
      // Mise à jour conditionnelle : deux envois simultanés du même code, un seul passe.
      const used = await tx.user.updateMany({
        where: {
          id: userId,
          OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: BigInt(step) } }],
        },
        data: { mfaLastStep: BigInt(step) },
      });
      if (used.count !== 1) throw new BadRequestException('Code incorrect ou déjà utilisé.');
      await tx.session.update({ where: { id: sessionId }, data: { mfaVerifiedAt: new Date() } });
      await this.audit.recordSystem(
        {
          actorUserId: userId,
          actorRole: 'self',
          action: 'auth.mfa_verified',
          entityType: 'session',
          entityId: sessionId,
        },
        tx,
      );
    });
  }

  /** Échec compté (au plus 5 par quart d'heure, vérifié avant chaque essai), puis refus. */
  private async failed(userId: string, message: string): Promise<never> {
    await this.rateLimit.consume(`mfa:${userId}`, Number.MAX_SAFE_INTEGER, 900);
    throw new BadRequestException(message);
  }

  private seal(secret: string): string {
    return this.crypto.encrypt(Buffer.from(secret, 'utf8')).toString('base64');
  }

  private open(sealed: string): string {
    return this.crypto.decrypt(Buffer.from(sealed, 'base64')).toString('utf8');
  }
}

export function isFresh(verifiedAt: Date | null): boolean {
  return verifiedAt !== null && Date.now() - verifiedAt.getTime() < MFA_SESSION_TTL_MS;
}
