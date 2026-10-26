import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import { TX_OPTIONS } from "../common/tx-options.js";
import { CacheService } from "../cache/cache.service.js";

@Injectable()
export class MemberProfileRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  // Includes inactive (soft-deleted) profiles. Used to decide between
  // reactivating and creating.
  findByUserId(userId: string) {
    return this.prisma.memberProfile.findUnique({ where: { userId } });
  }

  findActiveByUserId(userId: string) {
    return this.prisma.memberProfile.findFirst({
      where: { userId, isActive: true },
    });
  }

  findActiveById(id: string) {
    return this.prisma.memberProfile.findFirst({
      where: { id, isActive: true },
    });
  }

  findAllActive() {
    return this.prisma.memberProfile.findMany({ where: { isActive: true } });
  }

  create(userId: string, data: Prisma.MemberProfileUncheckedUpdateInput) {
    return this.prisma.memberProfile.create({
      data: {
        userId,
        ...data,
        isActive: true,
      } as Prisma.MemberProfileUncheckedCreateInput,
    });
  }

  updateByUserId(
    userId: string,
    data: Prisma.MemberProfileUncheckedUpdateInput,
  ) {
    return this.prisma.memberProfile.update({ where: { userId }, data });
  }

  /**
   * Soft delete: removes the member's confirmed class enrollments and marks
   * the profile inactive, atomically (a crash between the two would leave a
   * "ghost" member counted against class capacity). Returns false if there
   * was no active profile.
   *
   * Only ClassMember rows are removed, not PendingSeat holds. Holds expire on
   * their own (a known gap, listed under Known limitations in the README).
   */
  async deactivateWithEnrollmentCleanup(userId: string): Promise<boolean> {
    const done = await this.prisma.$transaction(async (tx) => {
      const profile = await tx.memberProfile.findFirst({
        where: { userId, isActive: true },
      });
      if (!profile) return false;

      await tx.classMember.deleteMany({
        where: { memberProfileId: profile.id },
      });
      await tx.memberProfile.update({
        where: { userId },
        data: { isActive: false },
      });
      return true;
    }, TX_OPTIONS);
    // Enrollments were deleted, so cached `enrolled` counts are stale.
    if (done) await this.cache.invalidateClasses();
    return done;
  }
}
