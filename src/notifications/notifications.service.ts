import { Injectable } from '@nestjs/common';
import type { Notification, NotificationType } from '@prisma/client';
import { NotificationsRepository } from './notifications.repository.js';
import { DeviceTokensRepository } from './device-tokens.repository.js';
import { PushService } from './push.service.js';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly notificationsRepo: NotificationsRepository,
    private readonly deviceTokensRepo: DeviceTokensRepository,
    private readonly push: PushService,
  ) {}

  // The frontend reads `relatedClass` / `relatedPayment` (the Mongoose field
  // names); Prisma returns `relatedClassId` / `relatedPaymentId`, so both
  // names are sent. The id itself is sent as `id` only: the frontend reads
  // `_id ?? id`, so it works with this API and with the Express one.
  private toApiShape(n: Notification) {
    return {
      ...n,
      relatedClass: n.relatedClassId ?? undefined,
      relatedPayment: n.relatedPaymentId ?? undefined,
    };
  }

  // Newest first, capped at `limit`. unreadCount is a separate count so it
  // stays correct even when there are more unread than the page holds.
  async getMyNotifications(userId: string, limit = 30) {
    const [notifications, unreadCount] = await Promise.all([
      this.notificationsRepo.findRecentByUserId(userId, limit),
      this.notificationsRepo.countUnread(userId),
    ]);
    return {
      notifications: notifications.map((n) => this.toApiShape(n)),
      unreadCount,
    };
  }

  // Returns null when the id doesn't exist or belongs to someone else.
  async markNotificationAsRead(notificationId: string, userId: string) {
    const result = await this.notificationsRepo.markReadForUser(
      notificationId,
      userId,
    );
    if (result.count === 0) return null;
    const updated = await this.notificationsRepo.findById(notificationId);
    return updated ? this.toApiShape(updated) : null;
  }

  markAllNotificationsAsRead(userId: string) {
    return this.notificationsRepo.markAllReadForUser(userId);
  }

  /**
   * Single entry point other services call when something is
   * notification-worthy. Swallows its own errors on purpose (same as
   * Express): a notification failing to save must never break the action
   * that triggered it.
   */
  async notify(params: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    classId?: string;
    paymentId?: string;
  }) {
    try {
      await this.notificationsRepo.create({
        userId: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        relatedClassId: params.classId,
        relatedPaymentId: params.paymentId,
      });
    } catch (err) {
      console.error('Failed to create notification:', err);
      return;
    }

    // Also push to the user's devices. Fire-and-forget: PushService never
    // throws, and the caller must not wait on Firebase.
    const data: Record<string, string> = { type: params.type };
    if (params.classId) data.classId = params.classId;
    if (params.paymentId) data.paymentId = params.paymentId;
    void this.push.sendToUser(params.userId, {
      title: params.title,
      body: params.message,
      data,
    });
  }

  /**
   * Sends the same notification to every active admin (in-app + push).
   * Like notify(), it never throws: an admin alert failing must not break
   * the payment flow that triggered it.
   */
  async notifyAdmins(params: {
    type: NotificationType;
    title: string;
    message: string;
    classId?: string;
    paymentId?: string;
  }) {
    try {
      const adminIds = await this.notificationsRepo.findActiveAdminIds();
      await Promise.all(
        adminIds.map((userId) => this.notify({ ...params, userId })),
      );
    } catch (err) {
      console.error('Failed to notify admins:', err);
    }
  }

  async registerDeviceToken(
    userId: string,
    token: string,
    platform: string = 'web',
  ) {
    await this.deviceTokensRepo.upsert(userId, token, platform);
  }

  // True if a token of this user was removed.
  unregisterDeviceToken(userId: string, token: string) {
    return this.deviceTokensRepo.deleteForUser(userId, token);
  }
}
