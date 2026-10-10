import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { getAvatarFallback } from '../common/avatar-fallback.util.js';
import { ClassesRepository } from './classes.repository.js';
import type { CreateClassDto } from './dto/create-class.dto.js';
import type { UpdateClassDto } from './dto/update-class.dto.js';

// Business rules for classes: validation, "already happened" checks, error
// messages, status calculation, response shaping. All database access lives
// in ClassesRepository — nothing in this file touches Prisma directly.
@Injectable()
export class ClassesService {
  constructor(private readonly classesRepo: ClassesRepository) {}

  /**
   * Reserves a temporary seat hold. The atomic part (row lock + capacity
   * check) is in ClassesRepository.reserveSeat; this method turns its
   * result code into a distinguishable HTTP exception per failure reason.
   *
   * DELIBERATE DIFFERENCE FROM EXPRESS: Express returns bare `null` for
   * every failure reason and callers must call getClassEnrollmentStatus to
   * learn why. Here each reason is a distinct exception.
   */
  async reserveSeat(classId: string, memberProfileId: string, ttlMinutes: number) {
    const result = await this.classesRepo.reserveSeat(
      classId,
      memberProfileId,
      ttlMinutes,
    );

    switch (result.status) {
      case 'reserved':
        return result.hold;
      case 'class-not-found':
        throw new NotFoundException('Class not found');
      case 'already-enrolled':
        throw new ConflictException('Already enrolled in this class');
      case 'active-hold':
        throw new ConflictException('You already have an active hold on this class');
      case 'class-full':
        throw new ConflictException('Class is full');
    }
  }

  /**
   * Immediately releases a member's hold (payment failed, checkout
   * abandoned, Paystack init errored). Unconditional delete — no
   * transaction needed.
   */
  releaseSeat(classId: string, memberProfileId: string) {
    return this.classesRepo.deleteHold(classId, memberProfileId);
  }

  /**
   * Converts a hold into a confirmed seat after payment succeeds. Returns
   * null (not an exception) when there's no unexpired hold: callers are
   * payment webhook/verification code that branches on the return value
   * (flag the payment for manual review), not request handlers.
   */
  confirmSeat(classId: string, memberProfileId: string) {
    return this.classesRepo.confirmHold(classId, memberProfileId);
  }

  /**
   * Sweeps every expired hold. Meant to be called on a schedule (Step 5's
   * Bull Queue job), not from a request path.
   */
  releaseExpiredHolds() {
    return this.classesRepo.deleteExpiredHolds();
  }

  /**
   * Reports why a member can or can't book, without reserving anything.
   * Status set kept identical to Express, including that an active
   * (unexpired) hold falls through to 'unknown'.
   */
  async getClassEnrollmentStatus(
    classId: string,
    memberProfileId: string,
  ): Promise<
    'class-not-found' | 'already-enrolled' | 'hold-expired' | 'class-full' | 'unknown'
  > {
    const snapshot = await this.classesRepo.getEnrollmentSnapshot(
      classId,
      memberProfileId,
    );
    if (!snapshot) return 'class-not-found';
    if (snapshot.isMember) return 'already-enrolled';

    const { mostRecentHold } = snapshot;
    const hadHold = mostRecentHold != null;
    const hasActiveHold = hadHold && mostRecentHold.expiresAt > new Date();
    if (hadHold && !hasActiveHold) return 'hold-expired';

    if (snapshot.capacity != null && snapshot.memberCount >= snapshot.capacity) {
      return 'class-full';
    }
    return 'unknown';
  }

  // Lightweight name lookup for notification text; null if class is gone.
  findClassName(id: string) {
    return this.classesRepo.findNameById(id);
  }

  // ------------------------
  // CREATE CLASS
  // ------------------------
  async createClass(dto: CreateClassDto) {
    const existing = await this.classesRepo.findByNameAndSchedule(
      dto.name,
      new Date(dto.schedule),
    );
    if (existing) {
      throw new ConflictException(
        'Class with same name and schedule already exists',
      );
    }

    // dto.trainer is a User id, not a TrainerProfile id — resolved here so
    // an invalid or non-trainer user id is rejected with a clear error
    // instead of being saved as a broken reference.
    const trainerProfile = await this.resolveTrainerProfileFromUserId(
      dto.trainer,
    );

    const created = await this.classesRepo.create({
      name: dto.name,
      description: dto.description,
      schedule: new Date(dto.schedule),
      duration: dto.duration,
      recurrence: dto.recurrence ?? 'none',
      recurrenceDays: dto.recurrenceDays ?? [],
      pricingOneTime: dto.pricing.oneTime,
      pricingWeekly: dto.pricing.weekly,
      pricingMonthly: dto.pricing.monthly,
      pricingThreeMonths: dto.pricing.threeMonths,
      capacity: dto.capacity,
      image: dto.image,
      trainerId: trainerProfile.id,
    });

    return this.findClassById(created.id);
  }

  // ------------------------
  // GET ALL CLASSES
  // ------------------------
  async findAllClasses() {
    const classes = await this.classesRepo.findAllWithRelations();
    return classes.map((c) => this.transformClass(c));
  }

  // Used by the admin member-details view ("classes joined").
  async getClassesByMemberId(memberProfileId: string) {
    const classes = await this.classesRepo.findByMemberProfileId(memberProfileId);
    return classes.map((c) => this.transformClass(c));
  }

  // Used by GET /api/trainers/my-classes.
  async getClassesByTrainerProfileId(trainerProfileId: string) {
    const classes = await this.classesRepo.findByTrainerProfileId(trainerProfileId);
    return classes.map((c) => this.transformClass(c));
  }

  // ------------------------
  // GET CLASS BY ID
  // ------------------------
  async findClassById(id: string) {
    const found = await this.classesRepo.findByIdWithRelations(id);
    if (!found) throw new NotFoundException('Class not found');
    return this.transformClass(found);
  }

  // Public — used for the "spots remaining" UI.
  async getClassMemberCount(id: string) {
    const found = await this.findClassById(id); // already transformed
    return {
      classId: found.id,
      className: found.name,
      totalMembers: found.enrolled,
      capacity: found.capacity || null,
      spotsRemaining: found.capacity ? found.capacity - found.enrolled : null,
      isFull: found.capacity ? found.enrolled >= found.capacity : false,
    };
  }

  // ------------------------
  // UPDATE CLASS
  // ------------------------
  async updateClass(id: string, dto: UpdateClassDto) {
    // Defends against a body that never reached the DTO (wrong
    // Content-Type, unparseable JSON): a clean 400 beats a raw 500.
    if (!dto || Object.keys(dto).length === 0) {
      throw new BadRequestException('At least one field must be provided');
    }

    const found = await this.classesRepo.findById(id);
    if (!found) throw new NotFoundException('Class not found');

    // A recurring class's series doesn't end when its anchor date passes;
    // this check only applies to one-off classes.
    if (found.recurrence === 'none' && found.schedule < new Date()) {
      throw new BadRequestException('Cannot update a class that already happened');
    }

    let resolvedTrainerId: string | undefined;
    if (dto.trainer) {
      const trainerProfile = await this.resolveTrainerProfileFromUserId(
        dto.trainer,
      );
      resolvedTrainerId = trainerProfile.id;
    }

    await this.classesRepo.update(id, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.schedule !== undefined && { schedule: new Date(dto.schedule) }),
      ...(dto.duration !== undefined && { duration: dto.duration }),
      ...(dto.recurrence !== undefined && { recurrence: dto.recurrence }),
      ...(dto.recurrenceDays !== undefined && {
        recurrenceDays: dto.recurrenceDays,
      }),
      ...(dto.pricing?.oneTime !== undefined && {
        pricingOneTime: dto.pricing.oneTime,
      }),
      ...(dto.pricing?.weekly !== undefined && {
        pricingWeekly: dto.pricing.weekly,
      }),
      ...(dto.pricing?.monthly !== undefined && {
        pricingMonthly: dto.pricing.monthly,
      }),
      ...(dto.pricing?.threeMonths !== undefined && {
        pricingThreeMonths: dto.pricing.threeMonths,
      }),
      ...(dto.capacity !== undefined && { capacity: dto.capacity }),
      ...(dto.image !== undefined && { image: dto.image }),
      ...(resolvedTrainerId && { trainerId: resolvedTrainerId }),
      // NOTE: dto.members (bulk-replace enrolled members) is NOT ported —
      // it needs its own diff-and-sync transaction (see migration plan).
    });

    return this.findClassById(id);
  }

  // ------------------------
  // DELETE CLASS
  // ------------------------
  async deleteClass(id: string) {
    const found = await this.classesRepo.findByIdWithMemberCount(id);
    if (!found) throw new NotFoundException('Class not found');

    const isCompleted = found.schedule < new Date();
    if (!isCompleted && found._count.members > 0) {
      throw new BadRequestException(
        'Cannot delete a class with enrolled members. Please remove all members first.',
      );
    }

    await this.classesRepo.delete(id);
    return { message: 'Class deleted successfully' };
  }

  // ------------------------
  // ADD MEMBER TO CLASS (admin-driven enrollment, distinct from the
  // member-initiated reserveSeat/confirmSeat checkout flow)
  // ------------------------
  async addMemberToClass(classId: string, userId: string) {
    const found = await this.classesRepo.findByIdWithMemberCount(classId);
    if (!found) throw new NotFoundException('Class not found');

    if (found.recurrence === 'none' && found.schedule < new Date()) {
      throw new BadRequestException('Cannot join a past class');
    }
    if (found.capacity != null && found._count.members >= found.capacity) {
      throw new BadRequestException('Class is full');
    }

    const memberProfile = await this.resolveMemberProfileFromUserId(userId);

    const alreadyMember = await this.classesRepo.findMembership(
      classId,
      memberProfile.id,
    );
    if (alreadyMember) {
      throw new BadRequestException('This member is already enrolled in this class');
    }

    await this.classesRepo.addMember(classId, memberProfile.id);
    return { message: 'Member added to class successfully' };
  }

  // ------------------------
  // REMOVE MEMBER FROM CLASS
  // ------------------------
  async removeMemberFromClass(classId: string, userId: string) {
    const found = await this.classesRepo.findById(classId);
    if (!found) throw new NotFoundException('Class not found');

    const memberProfile = await this.resolveMemberProfileFromUserId(userId);

    const existing = await this.classesRepo.findMembership(
      classId,
      memberProfile.id,
    );
    if (!existing) {
      throw new BadRequestException('Member is not enrolled in this class');
    }

    await this.classesRepo.removeMember(existing.id);
    return { message: 'Member removed from class successfully' };
  }

  // Used by the subscription-expiry job (no request context). Unlike
  // removeMemberFromClass it never throws: returns true if the member was
  // enrolled and has been removed, false if they were not enrolled. Safe
  // to call repeatedly.
  async removeMemberByProfileId(
    classId: string,
    memberProfileId: string,
  ): Promise<boolean> {
    const existing = await this.classesRepo.findMembership(
      classId,
      memberProfileId,
    );
    if (!existing) return false;
    await this.classesRepo.removeMember(existing.id);
    return true;
  }

  // ------------------------
  // ASSIGN / CHANGE TRAINER
  // ------------------------
  async assignTrainerToClass(classId: string, userId: string) {
    const found = await this.classesRepo.findById(classId);
    if (!found) throw new NotFoundException('Class not found');

    if (found.recurrence === 'none' && found.schedule < new Date()) {
      throw new BadRequestException('Cannot assign trainer to past class');
    }

    const trainerProfile = await this.resolveTrainerProfileFromUserId(userId);

    if (found.trainerId === trainerProfile.id) {
      throw new BadRequestException(
        'This trainer is already assigned to this class',
      );
    }

    await this.classesRepo.setTrainer(classId, trainerProfile.id);
    return this.findClassById(classId);
  }

  // ------------------------
  // GET CLASS MEMBERS (trainers/admins — full member details, no payment
  // info). Trainers may only view classes they teach; admins are exempt.
  // ------------------------
  async getClassMembers(
    classId: string,
    requestingUserId: string,
    userRole: string,
  ) {
    const found = await this.classesRepo.findById(classId);
    if (!found) throw new NotFoundException('Class not found');

    if (userRole === 'trainer') {
      const trainerProfile =
        await this.classesRepo.findTrainerProfileByUserId(requestingUserId);
      if (!trainerProfile || found.trainerId !== trainerProfile.id) {
        throw new ForbiddenException(
          'You can only view members for classes you teach',
        );
      }
    }

    const memberships = await this.classesRepo.findMembershipsWithProfiles(classId);

    // Mirrors Express's filter on role === "member" — defensive against a
    // MemberProfile whose User has since changed role (e.g. to trainer).
    const membersOnly = memberships
      .filter((m) => m.memberProfile.user.role === 'member')
      .map((m) => ({
        id: m.memberProfile.id,
        avatar: m.memberProfile.avatar,
        phone: m.memberProfile.phone,
        gender: m.memberProfile.gender,
        fitnessGoal: m.memberProfile.fitnessGoal,
        isActive: m.memberProfile.isActive,
        userId: {
          name: m.memberProfile.user.name,
          email: m.memberProfile.user.email,
          role: m.memberProfile.user.role,
        },
      }));

    return {
      classId: found.id,
      className: found.name,
      schedule: found.schedule,
      totalMembers: membersOnly.length,
      members: membersOnly,
    };
  }

  // ------------------------
  // Shared lookups — resolve a User id to its Trainer/Member profile,
  // validating the role along the way.
  // ------------------------
  private async resolveTrainerProfileFromUserId(userId: string) {
    const user = await this.classesRepo.findUserById(userId);
    if (!user) throw new NotFoundException('Trainer user not found');
    if (user.role !== 'trainer') {
      throw new BadRequestException('Assigned user is not a trainer');
    }
    const trainerProfile =
      await this.classesRepo.findTrainerProfileByUserId(userId);
    if (!trainerProfile) {
      throw new NotFoundException('Trainer profile not found for this user');
    }
    return trainerProfile;
  }

  private async resolveMemberProfileFromUserId(userId: string) {
    const user = await this.classesRepo.findUserById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'member') {
      throw new BadRequestException('User is not a member');
    }
    const memberProfile =
      await this.classesRepo.findMemberProfileByUserId(userId);
    if (!memberProfile) {
      throw new NotFoundException('Member profile not found');
    }
    return memberProfile;
  }

  // ------------------------
  // STATUS FOR RECURRING CLASSES — direct port of Express's
  // getRecurringStatus, same logic, same reasoning in the original
  // comments preserved below.
  // ------------------------
  private getRecurringStatus(
    scheduleAnchor: Date,
    durationMinutes: number,
    recurrence: string,
    recurrenceDays: string[],
    now: Date,
  ): 'upcoming' | 'ongoing' {
    // The series hasn't had its first occurrence yet at all.
    if (now < scheduleAnchor) return 'upcoming';

    const dayNames = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ];
    const todayName = dayNames[now.getDay()];

    // Daily classes run every day; weekly classes only run on their
    // selected recurrenceDays. ("monthly" recurrence exists on the model
    // but isn't currently offered in the create/edit UI — treated like
    // daily as a safe fallback since it's not actually reachable today,
    // same as Express.)
    const isValidDayToday =
      recurrence === 'daily' ||
      recurrence === 'monthly' ||
      (recurrence === 'weekly' && recurrenceDays.includes(todayName));

    if (!isValidDayToday) return 'upcoming';

    const todaysSessionStart = new Date(now);
    todaysSessionStart.setHours(
      scheduleAnchor.getHours(),
      scheduleAnchor.getMinutes(),
      scheduleAnchor.getSeconds(),
      0,
    );
    const todaysSessionEnd = new Date(
      todaysSessionStart.getTime() + durationMinutes * 60000,
    );

    if (now >= todaysSessionStart && now <= todaysSessionEnd) {
      return 'ongoing';
    }
    return 'upcoming';
  }

  // ------------------------
  // TRANSFORM CLASS FOR FRONTEND — direct port of Express's
  // transformClass. `duration` deliberately stays a formatted string
  // ("60 min") to match the existing frontend contract exactly, even
  // though formatting inside a service method is a slightly unusual
  // place for it — flagging that as inherited, not re-litigating a
  // frontend-facing contract decision that predates this migration.
  // ------------------------
  private transformClass(cls: any) {
    const now = new Date();
    const scheduleDate = new Date(cls.schedule);
    const endTime = new Date(scheduleDate.getTime() + cls.duration * 60000);

    let status: 'upcoming' | 'ongoing' | 'completed';

    if (cls.recurrence === 'none' || !cls.recurrence) {
      if (now < scheduleDate) status = 'upcoming';
      else if (now >= scheduleDate && now <= endTime) status = 'ongoing';
      else status = 'completed';
    } else {
      status = this.getRecurringStatus(
        scheduleDate,
        cls.duration,
        cls.recurrence,
        cls.recurrenceDays ?? [],
        now,
      );
    }

    const trainer = cls.trainer
      ? {
          id: cls.trainer.id,
          userId: cls.trainer.userId,
          name: cls.trainer.user?.name ?? 'Unknown Trainer',
          avatar:
            cls.trainer.avatar ??
            getAvatarFallback(cls.trainer.user?.name ?? 'Trainer'),
          bio: cls.trainer.bio ?? null,
          specialty: cls.trainer.specialty ?? null,
          phone: cls.trainer.phone ?? null,
          experience: cls.trainer.experience ?? null,
          certifications: cls.trainer.certifications ?? [],
          availability: cls.trainer.availability ?? null,
        }
      : {
          id: '',
          userId: '',
          name: 'Unassigned',
          avatar: getAvatarFallback('Unassigned'),
          bio: null,
          specialty: null,
          phone: null,
          experience: null,
          certifications: [],
          availability: null,
        };

    return {
      id: cls.id,
      name: cls.name,
      description: cls.description ?? '',
      schedule: cls.schedule,
      duration: `${cls.duration} min`,
      recurrence: cls.recurrence ?? 'none',
      recurrenceDays: cls.recurrenceDays ?? [],
      trainer,
      pricing: {
        oneTime: cls.pricingOneTime != null ? Number(cls.pricingOneTime) : undefined,
        weekly: cls.pricingWeekly != null ? Number(cls.pricingWeekly) : undefined,
        monthly: cls.pricingMonthly != null ? Number(cls.pricingMonthly) : undefined,
        threeMonths:
          cls.pricingThreeMonths != null ? Number(cls.pricingThreeMonths) : undefined,
      },
      capacity: cls.capacity ?? 0,
      enrolled: cls._count?.members ?? 0,
      status,
      image: cls.image ?? null,
    };
  }
}
