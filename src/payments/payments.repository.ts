import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

const USER_SUMMARY = { select: { id: true, name: true, email: true } } as const;

// Data access for Payment and ClassSubscription. Business rules (Paystack
// calls, seat claiming, status transitions, notifications) stay in
// PaymentsService.
@Injectable()
export class PaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Checks before starting a checkout ─────────────────────────────

  findCompletedPayment(userId: string, classId: string) {
    return this.prisma.payment.findFirst({
      where: { userId, classId, status: 'completed' },
    });
  }

  findActiveSubscription(userId: string, classId: string) {
    return this.prisma.classSubscription.findFirst({
      where: { userId, classId, status: 'active' },
    });
  }

  // ── Writes ────────────────────────────────────────────────────────

  create(data: Prisma.PaymentUncheckedCreateInput) {
    return this.prisma.payment.create({ data });
  }

  updateByReference(reference: string, data: Prisma.PaymentUncheckedUpdateInput) {
    return this.prisma.payment.update({
      where: { paystackReference: reference },
      data,
    });
  }

  // The FK lives on ClassSubscription.paymentId — creating this row is
  // what links a subscription to its payment.
  createSubscription(data: Prisma.ClassSubscriptionUncheckedCreateInput) {
    return this.prisma.classSubscription.create({ data });
  }

  // Only flips a row that is STILL pending, so the sweep can never
  // overwrite a payment that completed/failed while it was running.
  // Returns true when a row was actually changed.
  async markPendingFailed(reference: string): Promise<boolean> {
    const result = await this.prisma.payment.updateMany({
      where: { paystackReference: reference, status: 'pending' },
      data: { status: 'failed' },
    });
    return result.count > 0;
  }

  // ── Reads ─────────────────────────────────────────────────────────

  // Pending payments created before `before` that have a Paystack
  // reference (without one there is nothing to verify). Oldest first,
  // capped so one sweep can't run unbounded after a long outage.
  findStalePending(before: Date, limit = 200) {
    return this.prisma.payment.findMany({
      where: {
        status: 'pending',
        paystackReference: { not: null },
        createdAt: { lt: before },
      },
      select: { id: true, paystackReference: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  findByReference(reference: string) {
    return this.prisma.payment.findUnique({
      where: { paystackReference: reference },
    });
  }

  findByUserId(userId: string) {
    return this.prisma.payment.findMany({
      where: { userId },
      include: {
        class: { select: { id: true, name: true, schedule: true } },
        subscription: {
          select: { status: true, startDate: true, endDate: true, interval: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findCompletedByClassId(classId: string) {
    return this.prisma.payment.findMany({
      where: { classId, status: 'completed' },
      include: { user: USER_SUMMARY },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByIdWithRelations(id: string) {
    return this.prisma.payment.findUnique({
      where: { id },
      include: {
        user: USER_SUMMARY,
        class: { select: { id: true, name: true } },
      },
    });
  }

  findAllWithRelations() {
    return this.prisma.payment.findMany({
      include: {
        user: USER_SUMMARY,
        class: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
