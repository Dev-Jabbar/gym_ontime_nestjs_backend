import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { TX_OPTIONS } from '../common/tx-options.js';
import { CacheService } from '../cache/cache.service.js';
import { CacheKeys, CLASSES_TTL_SECONDS } from '../cache/cache-keys.js';
import { ClassEvents } from './class-events.service.js';

// Every read that feeds transformClass() needs the same joins.
const CLASS_WITH_RELATIONS = {
  trainer: { include: { user: { select: { name: true } } } },
  _count: { select: { members: true } },
} as const;

export type ReserveSeatResult =
  | { status: 'reserved'; hold: { id: string; expiresAt: Date } }
  | { status: 'class-not-found' }
  | { status: 'already-enrolled' }
  | { status: 'active-hold' }
  | { status: 'class-full' };

// Data access for Class, ClassMember and PendingSeat. Contains no business
// rules and throws no HTTP exceptions: it returns data or a result code, and
// ClassesService decides what that means.
@Injectable()
export class ClassesRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly events: ClassEvents,
  ) {}

  // ── Seat holds ────────────────────────────────────────────────────

  /**
   * Atomically reserves a seat. SELECT ... FOR UPDATE row-locks the Class for
   * the whole transaction, which makes the capacity check below race-free.
   * Prisma's query builder cannot express FOR UPDATE, so this one query is
   * raw SQL. Returns a result code instead of throwing, so the service owns
   * the mapping to error messages.
   */
  reserveSeat(
    classId: string,
    memberProfileId: string,
    ttlMinutes: number,
  ): Promise<ReserveSeatResult> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string; capacity: number | null }[]>`
        SELECT id, capacity FROM "Class" WHERE id = ${classId} FOR UPDATE
      `;
      const classRow = rows[0];
      if (!classRow) return { status: 'class-not-found' as const };

      // Clear this member's own lapsed holds so a retry is not blocked by them.
      await tx.pendingSeat.deleteMany({
        where: { classId, memberProfileId, expiresAt: { lte: now } },
      });

      const alreadyMember = await tx.classMember.findUnique({
        where: { classId_memberProfileId: { classId, memberProfileId } },
      });
      if (alreadyMember) return { status: 'already-enrolled' as const };

      const activeHold = await tx.pendingSeat.findFirst({
        where: { classId, memberProfileId, expiresAt: { gt: now } },
      });
      if (activeHold) return { status: 'active-hold' as const };

      // Safe from check-then-write races only because the row lock taken by
      // the first query is still held.
      if (classRow.capacity != null) {
        const [memberCount, pendingCount] = await Promise.all([
          tx.classMember.count({ where: { classId } }),
          tx.pendingSeat.count({ where: { classId, expiresAt: { gt: now } } }),
        ]);
        if (memberCount + pendingCount >= classRow.capacity) {
          return { status: 'class-full' as const };
        }
      }

      const hold = await tx.pendingSeat.create({
        data: { classId, memberProfileId, expiresAt },
      });
      return { status: 'reserved' as const, hold };
    }, TX_OPTIONS);
  }

  deleteHold(classId: string, memberProfileId: string) {
    return this.prisma.pendingSeat.deleteMany({
      where: { classId, memberProfileId },
    });
  }

  /**
   * Turns an unexpired hold into a ClassMember row. Returns null if there is
   * no unexpired hold. Uses an upsert rather than a create so that webhook
   * retries are idempotent.
   */
  async confirmHold(classId: string, memberProfileId: string) {
    const now = new Date();
    const member = await this.prisma.$transaction(async (tx) => {
      const hold = await tx.pendingSeat.findFirst({
        where: { classId, memberProfileId, expiresAt: { gt: now } },
      });
      if (!hold) return null;

      await tx.pendingSeat.delete({ where: { id: hold.id } });

      return tx.classMember.upsert({
        where: { classId_memberProfileId: { classId, memberProfileId } },
        update: {},
        create: { classId, memberProfileId },
      });
    }, TX_OPTIONS);
    // A confirmed seat changes `enrolled` in the cached class payloads.
    if (member) {
      await this.cache.invalidateClasses();
      this.events.classChanged(classId);
    }
    return member;
  }

  deleteExpiredHolds() {
    return this.prisma.pendingSeat.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
  }

  /**
   * Raw facts for getClassEnrollmentStatus. Returns null when the class does
   * not exist. Interpreting the facts is the service's job.
   */
  async getEnrollmentSnapshot(classId: string, memberProfileId: string) {
    const classRow = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { capacity: true, _count: { select: { members: true } } },
    });
    if (!classRow) return null;

    const membership = await this.findMembership(classId, memberProfileId);
    const mostRecentHold = await this.prisma.pendingSeat.findFirst({
      where: { classId, memberProfileId },
      orderBy: { expiresAt: 'desc' },
    });

    return {
      capacity: classRow.capacity,
      memberCount: classRow._count.members,
      isMember: membership != null,
      mostRecentHold,
    };
  }

  // ── Class reads ───────────────────────────────────────────────────

  findByNameAndSchedule(name: string, schedule: Date) {
    return this.prisma.class.findFirst({ where: { name, schedule } });
  }

  findById(id: string) {
    return this.prisma.class.findUnique({ where: { id } });
  }

  // Cached (cache-aside). The cached copy has been through JSON, so
  // `schedule` is an ISO string rather than a Date; its only consumer,
  // transformClass(), handles both. `status` is computed from the clock at
  // read time in the service, so it is never stale.
  findByIdWithRelations(id: string) {
    return this.cache.wrap(CacheKeys.classDetail(id), CLASSES_TTL_SECONDS, () =>
      this.prisma.class.findUnique({
        where: { id },
        include: CLASS_WITH_RELATIONS,
      }),
    );
  }

  findByIdWithMemberCount(id: string) {
    return this.prisma.class.findUnique({
      where: { id },
      include: { _count: { select: { members: true } } },
    });
  }

  // Classes that could need a reminder now: they have at least one active
  // member and are either recurring or a one-off that has not started yet.
  // Not cached, because the reminder job needs fresh data.
  findForReminders(now: Date) {
    return this.prisma.class.findMany({
      where: {
        members: { some: { memberProfile: { isActive: true } } },
        OR: [{ recurrence: { not: 'none' } }, { schedule: { gt: now } }],
      },
      select: {
        id: true,
        name: true,
        schedule: true,
        recurrence: true,
        recurrenceDays: true,
        lastReminderSentAt: true,
        members: {
          where: { memberProfile: { isActive: true } },
          select: { memberProfile: { select: { userId: true } } },
        },
      },
    });
  }

  // Uses updateMany so a class deleted in the meantime is a no-op rather than
  // an error. Does not touch the cache: lastReminderSentAt is not part of the
  // API shape.
  async markReminderSent(id: string, at: Date): Promise<void> {
    await this.prisma.class.updateMany({
      where: { id },
      data: { lastReminderSentAt: at },
    });
  }

  async findNameById(id: string): Promise<string | null> {
    const row = await this.prisma.class.findUnique({
      where: { id },
      select: { name: true },
    });
    return row?.name ?? null;
  }

  // Cached (cache-aside); same JSON caveat as findByIdWithRelations.
  findAllWithRelations() {
    return this.cache.wrap(CacheKeys.classList(), CLASSES_TTL_SECONDS, () =>
      this.prisma.class.findMany({
        include: CLASS_WITH_RELATIONS,
        orderBy: { schedule: 'asc' },
      }),
    );
  }

  findByMemberProfileId(memberProfileId: string) {
    return this.prisma.class.findMany({
      where: { members: { some: { memberProfileId } } },
      include: CLASS_WITH_RELATIONS,
      orderBy: { schedule: 'asc' },
    });
  }

  findByTrainerProfileId(trainerProfileId: string) {
    return this.prisma.class.findMany({
      where: { trainerId: trainerProfileId },
      include: CLASS_WITH_RELATIONS,
      orderBy: { schedule: 'asc' },
    });
  }

  // ── Class writes ──────────────────────────────────────────────────

  // Every write below invalidates the cache after it commits.

  async create(data: Prisma.ClassUncheckedCreateInput) {
    const created = await this.prisma.class.create({ data });
    await this.cache.invalidateClasses();
    this.events.classChanged(created.id);
    return created;
  }

  async update(id: string, data: Prisma.ClassUncheckedUpdateInput) {
    const updated = await this.prisma.class.update({ where: { id }, data });
    await this.cache.invalidateClasses();
    this.events.classChanged(id);
    return updated;
  }

  async setTrainer(classId: string, trainerId: string) {
    const updated = await this.prisma.class.update({
      where: { id: classId },
      data: { trainerId },
    });
    await this.cache.invalidateClasses();
    return updated;
  }

  async delete(id: string) {
    const deleted = await this.prisma.class.delete({ where: { id } });
    await this.cache.invalidateClasses();
    this.events.classChanged(id);
    return deleted;
  }

  // ── Membership ────────────────────────────────────────────────────

  findMembership(classId: string, memberProfileId: string) {
    return this.prisma.classMember.findUnique({
      where: { classId_memberProfileId: { classId, memberProfileId } },
    });
  }

  async addMember(classId: string, memberProfileId: string) {
    const member = await this.prisma.classMember.create({
      data: { classId, memberProfileId },
    });
    await this.cache.invalidateClasses();
    this.events.classChanged(classId);
    return member;
  }

  async removeMember(membershipId: string) {
    const removed = await this.prisma.classMember.delete({
      where: { id: membershipId },
    });
    await this.cache.invalidateClasses();
    this.events.classChanged(removed.classId);
    return removed;
  }

  findMembershipsWithProfiles(classId: string) {
    return this.prisma.classMember.findMany({
      where: { classId },
      include: {
        memberProfile: {
          include: {
            user: { select: { name: true, email: true, role: true } },
          },
        },
      },
    });
  }

  // ── Cross-aggregate lookups ───────────────────────────────────────
  // ClassesService resolves a User id into a trainer or member profile. These
  // lookups live here rather than going through UsersService because
  // TrainerProfileModule already imports ClassesModule (importing back would
  // create a module cycle), and because they intentionally apply no isActive
  // filter, unlike UsersService.findById.

  findUserById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findTrainerProfileByUserId(userId: string) {
    return this.prisma.trainerProfile.findUnique({ where: { userId } });
  }

  findMemberProfileByUserId(userId: string) {
    return this.prisma.memberProfile.findUnique({ where: { userId } });
  }
}
