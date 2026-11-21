import { Inject, Injectable } from '@nestjs/common';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { EmailQueue } from './email-queue';
import type { NewNotification, NotificationChannel } from './notifications.service';
import { NOTIFICATION_TYPE_LABELS } from '@konzia/shared';

/**
 * Canal e-mail des notifications : seulement vers une adresse vérifiée d'un compte actif,
 * et seulement si l'utilisateur n'a pas désactivé ce type d'e-mail.
 */
@Injectable()
export class EmailChannel implements NotificationChannel {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly system: PrismaService,
    private readonly queue: EmailQueue,
  ) {}

  async deliver(created: (NewNotification & { id: string })[]): Promise<void> {
    const userIds = [...new Set(created.map((n) => n.recipientUserId))];
    const [users, optOuts] = await Promise.all([
      this.system.user.findMany({
        where: { id: { in: userIds }, status: 'active', emailVerifiedAt: { not: null } },
        select: { id: true, email: true, displayName: true },
      }),
      this.system.notificationPreference.findMany({
        where: { userId: { in: userIds }, channel: 'email', enabled: false },
        select: { userId: true, type: true },
      }),
    ]);
    const byId = new Map(users.map((u) => [u.id, u]));
    const off = new Set(optOuts.map((o) => `${o.userId}|${o.type}`));
    const rows = created
      .filter((n) => byId.has(n.recipientUserId) && !off.has(`${n.recipientUserId}|${n.type}`))
      .map((n) => {
        const user = byId.get(n.recipientUserId)!;
        return {
          notificationId: n.id,
          recipientUserId: n.recipientUserId,
          channel: 'email',
          toAddress: user.email,
          subject: `Konzia — ${NOTIFICATION_TYPE_LABELS[n.type]}`,
          bodyText: emailText(this.env.APP_URL, user.displayName, n),
        };
      });
    if (rows.length === 0) return;
    const saved = await this.system.outboundMessage.createManyAndReturn({
      data: rows,
      select: { id: true },
    });
    await this.queue.enqueue(saved.map((r) => r.id));
  }
}

/** Modèle d'e-mail en français, en texte simple (lisible sur tous les téléphones). */
export function emailText(appUrl: string, name: string, n: NewNotification): string {
  return [
    `Bonjour ${name},`,
    '',
    n.body,
    '',
    `Voir le détail : ${appUrl}${n.link}`,
    '',
    '—',
    'Konzia',
    `Choisir les e-mails que vous recevez : ${appUrl}/notifications`,
  ].join('\n');
}
