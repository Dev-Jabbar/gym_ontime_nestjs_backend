import { Injectable } from '@nestjs/common';
import type { Role, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { TX_OPTIONS } from '../common/tx-options.js';
import { CacheService } from '../cache/cache.service.js';

// Data access for User. No business rules, no HTTP exceptions and no password
// hashing: UsersService passes in already-hashed passwords.
//
// A few methods (create, restore, softDelete, upgradeToTrainer) also write
// MemberProfile, TrainerProfile, ClassMember and Class rows. That is
// deliberate: those writes must commit or roll back together with the User
// write, and a Prisma transaction can only span calls made on its own
// transaction client.
@Injectable()
export class UsersRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  findActiveByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { email, isActive: true } });
  }

  findByEmailIncludingDeleted(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findActiveById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { id, isActive: true } });
  }

  findAllActive(): Promise<User[]> {
    return this.prisma.user.findMany({ where: { isActive: true } });
  }

  async update(
    id: string,
    data: { name?: string; email?: string; role?: Role },
  ): Promise<User> {
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.role !== undefined && { role: data.role }),
      },
    });
    // A trainer's name is shown inside the cached class payloads.
    if (data.name !== undefined) await this.cache.invalidateClasses();
    return updated;
  }

  /** Creates a user and its MemberProfile atomically. */
  createWithMemberProfile(data: {
    name: string;
    email: string;
    hashedPassword: string;
  }): Promise<User> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          password: data.hashedPassword,
        },
      });
      await tx.memberProfile.create({
        data: { userId: user.id, isActive: true },
      });
      return user;
    }, TX_OPTIONS);
  }

  /**
   * Revives a soft-deleted user as a member and reactivates (or creates, if
   * missing) their MemberProfile, atomically.
   */
  restoreAsMember(
    userId: string,
    data: { name: string; hashedPassword: string },
  ): Promise<User> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: {
          name: data.name,
          password: data.hashedPassword,
          isActive: true,
          deletedAt: null,
          role: 'member',
        },
      });

      const existingProfile = await tx.memberProfile.findUnique({
        where: { userId },
      });
      if (existingProfile) {
        await tx.memberProfile.update({
          where: { userId },
          data: { isActive: true },
        });
      } else {
        await tx.memberProfile.create({ data: { userId, isActive: true } });
      }

      return user;
    }, TX_OPTIONS);
  }

  /**
   * Soft-deletes the user and cascades: removes their class enrollments,
   * unassigns them from classes they teach (the classes are kept, just
   * without a trainer) and deactivates both profiles.
   */
  async softDeleteWithCascade(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const memberProfile = await tx.memberProfile.findUnique({
        where: { userId: id },
      });
      if (memberProfile) {
        await tx.classMember.deleteMany({
          where: { memberProfileId: memberProfile.id },
        });
      }

      const trainerProfile = await tx.trainerProfile.findUnique({
        where: { userId: id },
      });
      if (trainerProfile) {
        await tx.class.updateMany({
          where: { trainerId: trainerProfile.id },
          data: { trainerId: null },
        });
      }

      await tx.memberProfile.updateMany({
        where: { userId: id },
        data: { isActive: false },
      });
      await tx.trainerProfile.updateMany({
        where: { userId: id },
        data: { isActive: false },
      });
      await tx.user.update({
        where: { id },
        data: { isActive: false, deletedAt: new Date() },
      });
    }, TX_OPTIONS);
    // The cascade changed enrollments and trainer assignments.
    await this.cache.invalidateClasses();
  }

  /**
   * Flips the role to trainer, deactivates the member profile and creates or
   * reactivates the trainer profile, all or nothing.
   */
  promoteToTrainer(id: string): Promise<User> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { role: 'trainer' },
      });

      await tx.memberProfile.updateMany({
        where: { userId: id },
        data: { isActive: false },
      });

      const existingTrainer = await tx.trainerProfile.findUnique({
        where: { userId: id },
      });
      if (existingTrainer) {
        await tx.trainerProfile.update({
          where: { userId: id },
          data: { isActive: true },
        });
      } else {
        await tx.trainerProfile.create({ data: { userId: id, isActive: true } });
      }

      return updated;
    }, TX_OPTIONS);
  }
}
