import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import {
  NOTIFICATION_TYPE_LABELS,
  NOTIFICATION_TYPES,
  NotificationPreferencesSchema,
  type NotificationInfo,
  type NotificationPreferenceInfo,
  type NotificationPreferencesInput,
  type NotificationType,
} from '@konzia/shared';
import type { AuthContext } from '../auth/auth.types';
import { Auth } from '../auth/decorators';
import { ZodBody } from '../common/zod-body.pipe';
import { TenantDb } from '../tenancy/tenant-db.service';

/** Centre de notifications : chacun ne voit et ne règle que les siennes (RLS). */
@Controller()
export class NotificationsController {
  constructor(private readonly db: TenantDb) {}

  @Get('notifications')
  list(@Auth() auth: AuthContext): Promise<NotificationInfo[]> {
    return this.db.run(auth.userId, async (tx) =>
      (
        await tx.notification.findMany({
          where: { recipientUserId: auth.userId },
          select: {
            id: true,
            type: true,
            title: true,
            body: true,
            link: true,
            readAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        })
      ).map((n) => ({
        id: n.id,
        type: n.type as NotificationType,
        title: n.title,
        body: n.body,
        link: n.link,
        read: n.readAt !== null,
        createdAt: n.createdAt.toISOString(),
      })),
    );
  }

  @Get('notifications/unread-count')
  async unread(@Auth() auth: AuthContext): Promise<{ count: number }> {
    const count = await this.db.run(auth.userId, (tx) =>
      tx.notification.count({ where: { recipientUserId: auth.userId, readAt: null } }),
    );
    return { count };
  }

  @Post('notifications/:id/read')
  @HttpCode(204)
  async read(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.db.run(auth.userId, (tx) =>
      tx.notification.updateMany({
        where: { id, recipientUserId: auth.userId, readAt: null },
        data: { readAt: new Date() },
      }),
    );
  }

  @Post('notifications/read-all')
  @HttpCode(204)
  async readAll(@Auth() auth: AuthContext): Promise<void> {
    await this.db.run(auth.userId, (tx) =>
      tx.notification.updateMany({
        where: { recipientUserId: auth.userId, readAt: null },
        data: { readAt: new Date() },
      }),
    );
  }

  @Get('me/notification-preferences')
  preferences(@Auth() auth: AuthContext): Promise<NotificationPreferenceInfo[]> {
    return this.db.run(auth.userId, async (tx) => {
      const rows = await tx.notificationPreference.findMany({
        where: { userId: auth.userId, channel: 'email' },
        select: { type: true, enabled: true },
      });
      const off = new Set(rows.filter((r) => !r.enabled).map((r) => r.type));
      return NOTIFICATION_TYPES.map((type) => ({
        type,
        label: NOTIFICATION_TYPE_LABELS[type],
        email: !off.has(type),
      }));
    });
  }

  @Put('me/notification-preferences')
  async setPreferences(
    @Auth() auth: AuthContext,
    @Body(new ZodBody(NotificationPreferencesSchema)) body: NotificationPreferencesInput,
  ): Promise<NotificationPreferenceInfo[]> {
    await this.db.run(auth.userId, async (tx) => {
      for (const p of body.preferences)
        await tx.notificationPreference.upsert({
          where: { userId_type_channel: { userId: auth.userId, type: p.type, channel: 'email' } },
          create: { userId: auth.userId, type: p.type, channel: 'email', enabled: p.email },
          update: { enabled: p.email },
          select: { type: true },
        });
    });
    return this.preferences(auth);
  }
}
