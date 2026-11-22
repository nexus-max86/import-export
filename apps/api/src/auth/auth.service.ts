import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  TERMS_VERSION,
  type LoginInput,
  type MeResponse,
  type RegisterInput,
} from '@konzia/shared';
import { Prisma, type EmailTokenPurpose } from '@konzia/db';
import { AuditService } from '../audit/audit.service';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { randomToken, sha256 } from '../common/crypto';
import { EmailQueue } from '../notifications/email-queue';
import { resetPasswordMessage, verifyEmailMessage } from '../email/templates';
import { PrismaService } from '../prisma/prisma.service';
import { burnPasswordCheck, hashPassword, verifyPassword } from './password';
import { SessionService } from './session.service';

const TOKEN_TTL_MS: Record<EmailTokenPurpose, number> = {
  verify_email: 48 * 3600_000,
  reset_password: 3600_000,
};

const INVALID_LINK = 'Ce lien n’est plus valable. Demandez-en un nouveau.';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly outbox: EmailQueue,
    @Inject(ENV) private readonly env: Env,
    private readonly audit: AuditService,
  ) {}

  async register(input: RegisterInput): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException('Un compte existe déjà avec cette adresse e-mail.');

    // Deux inscriptions simultanées avec la même adresse : la contrainte unique tranche.
    const user = await this.createUser(input);
    await this.sendVerification(user.id, user.email, user.displayName);
  }

  private async createUser(input: RegisterInput) {
    try {
      return await this.prisma.user.create({
        data: {
          email: input.email,
          displayName: input.displayName,
          passwordHash: await hashPassword(input.password),
          consents: {
            create: [
              { kind: 'terms', version: TERMS_VERSION, granted: true },
              { kind: 'privacy', version: TERMS_VERSION, granted: true },
              { kind: 'marketing', version: TERMS_VERSION, granted: input.marketingOptIn },
            ],
          },
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Un compte existe déjà avec cette adresse e-mail.');
      }
      throw err;
    }
  }

  async resendVerification(userId: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.emailVerifiedAt) return;
    await this.sendVerification(user.id, user.email, user.displayName);
  }

  async verifyEmail(token: string): Promise<void> {
    const record = await this.consumeToken(token, 'verify_email');
    await this.prisma.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: new Date() },
    });
  }

  /** Vérifie les identifiants ; message identique que l'e-mail existe ou non. */
  async login(input: LoginInput, userAgent?: string, ip?: string) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user) {
      await burnPasswordCheck(input.password);
      throw new UnauthorizedException('E-mail ou mot de passe incorrect.');
    }
    if (!(await verifyPassword(user.passwordHash, input.password))) {
      throw new UnauthorizedException('E-mail ou mot de passe incorrect.');
    }
    if (user.status !== 'active') {
      throw new UnauthorizedException('Ce compte est suspendu. Contactez le support Konzia.');
    }
    return this.sessions.create(user.id, userAgent, ip);
  }

  /** Toujours silencieux : ne révèle pas si l'adresse a un compte. */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== 'active') return;
    const token = await this.issueToken(user.id, 'reset_password');
    await this.outbox.sendOrQueue(
      resetPasswordMessage(
        user.email,
        user.displayName,
        `${this.env.APP_URL}/reinitialiser?jeton=${token}`,
      ),
      user.id,
    );
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const record = await this.consumeToken(token, 'reset_password');
    await this.prisma.user.update({
      where: { id: record.userId },
      // Le lien reçu par e-mail prouve aussi la possession de l'adresse.
      data: {
        passwordHash: await hashPassword(password),
        emailVerifiedAt: record.user.emailVerifiedAt ?? new Date(),
      },
    });
    await this.sessions.revokeAll(record.userId);
    await this.audit.recordSystem({
      actorUserId: record.userId,
      actorRole: 'self',
      action: 'auth.password_reset',
      entityType: 'user',
      entityId: record.userId,
    });
  }

  async me(userId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      emailVerified: user.emailVerifiedAt !== null,
      platformRole: user.platformRole,
    };
  }

  private async sendVerification(userId: string, email: string, name: string): Promise<void> {
    const token = await this.issueToken(userId, 'verify_email');
    await this.outbox.sendOrQueue(
      verifyEmailMessage(email, name, `${this.env.APP_URL}/verifier-email?jeton=${token}`),
      userId,
    );
  }

  /** Crée un jeton et invalide les précédents de même usage. */
  private async issueToken(userId: string, purpose: EmailTokenPurpose): Promise<string> {
    const token = randomToken();
    await this.prisma.$transaction([
      this.prisma.emailToken.updateMany({
        where: { userId, purpose, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.emailToken.create({
        data: {
          userId,
          purpose,
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + TOKEN_TTL_MS[purpose]),
        },
      }),
    ]);
    return token;
  }

  /** Marque un jeton comme utilisé, atomiquement : un second usage échoue. */
  private async consumeToken(token: string, purpose: EmailTokenPurpose) {
    const tokenHash = sha256(token);
    const { count } = await this.prisma.emailToken.updateMany({
      where: { tokenHash, purpose, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (count !== 1) throw new BadRequestException(INVALID_LINK);
    return this.prisma.emailToken.findUniqueOrThrow({
      where: { tokenHash },
      include: { user: true },
    });
  }
}
