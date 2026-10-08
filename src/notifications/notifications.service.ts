import { Injectable } from '@nestjs/common';
import type { Notification, NotificationType } from '@prisma/client';
import { NotificationsRepository } from './notifications.repository.js';

@Injectable()
export class NotificationsService {
  constructor(private readonly notificationsRepo: NotificationsRepository) {}

  // The frontend (useNotifications / NotificationBell) was written against
  // Mongoose shapes: it keys and matches on `_id` and reads `relatedClass` /
  // `relatedPayment`. Prisma returns `id`, `relatedClassId`, `relatedPaymentId`.
  // Same aliasing approach as PaymentsService.toApiShape: add the old names,
  // keep the new ones.
  private toApiShape(n: Notification) {
    return {
      ...n,
      _id: n.id,
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
    }
  }
}
