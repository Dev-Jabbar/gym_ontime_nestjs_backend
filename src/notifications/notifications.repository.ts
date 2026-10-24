import { Injectable } from '@nestjs/common';
import type { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findRecentByUserId(userId: string, limit: number) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  countUnread(userId: string) {
    return this.prisma.notification.count({ where: { userId, read: false } });
  }

  findById(id: string) {
    return this.prisma.notification.findUnique({ where: { id } });
  }

  // updateMany scoped to id AND userId: a user can only touch their own
  // notifications, and "wrong id or wrong user" is count 0 rather than a
  // thrown error.
  markReadForUser(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { read: true },
    });
  }

  markAllReadForUser(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }

  // Ids of everyone who should receive admin alerts: active admins only.
  async findActiveAdminIds(): Promise<string[]> {
    const admins = await this.prisma.user.findMany({
      where: { role: 'admin', isActive: true, deletedAt: null },
      select: { id: true },
    });
    return admins.map((a) => a.id);
  }

  create(data: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    relatedClassId?: string;
    relatedPaymentId?: string;
  }) {
    return this.prisma.notification.create({ data });
  }
}
