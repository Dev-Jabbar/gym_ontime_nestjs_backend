import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { TX_OPTIONS } from '../common/tx-options.js';
import { CacheService } from '../cache/cache.service.js';

@Injectable()
export class TrainerProfileRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  // Includes inactive (soft-deleted) profiles. Used to decide between
  // reactivating and creating.
  findByUserId(userId: string) {
    return this.prisma.trainerProfile.findUnique({ where: { userId } });
  }

  findActiveByUserId(userId: string) {
    return this.prisma.trainerProfile.findFirst({
      where: { userId, isActive: true },
    });
  }

  findActiveById(id: string) {
    return this.prisma.trainerProfile.findFirst({
      where: { id, isActive: true },
    });
  }

  findAllActive() {
    return this.prisma.trainerProfile.findMany({ where: { isActive: true } });
  }

  create(userId: string, data: Prisma.TrainerProfileUncheckedUpdateInput) {
    return this.prisma.trainerProfile.create({
      data: { userId, ...data, isActive: true } as Prisma.TrainerProfileUncheckedCreateInput,
    });
  }

  // Trainer fields (bio, avatar, specialty...) are embedded in the cached
  // class payloads, so a profile edit must invalidate them.
  async updateByUserId(userId: string, data: Prisma.TrainerProfileUncheckedUpdateInput) {
    const updated = await this.prisma.trainerProfile.update({ where: { userId }, data });
    await this.cache.invalidateClasses();
    return updated;
  }

  /**
   * Soft delete plus unassign from their classes, atomically, so classes are
   * never left pointing at an inactive trainer. The classes themselves stay,
   * without a trainer. Returns false if there was no active profile.
   */
  async deactivateAndUnassignClasses(userId: string): Promise<boolean> {
    const done = await this.prisma.$transaction(async (tx) => {
      const profile = await tx.trainerProfile.findFirst({
        where: { userId, isActive: true },
      });
      if (!profile) return false;

      await tx.class.updateMany({
        where: { trainerId: profile.id },
        data: { trainerId: null },
      });
      await tx.trainerProfile.update({
        where: { userId },
        data: { isActive: false },
      });
      return true;
    }, TX_OPTIONS);
    // Classes just became "Unassigned" in the cached payloads.
    if (done) await this.cache.invalidateClasses();
    return done;
  }
}
