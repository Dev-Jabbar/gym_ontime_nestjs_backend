import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MemberProfileRepository } from './member-profile.repository.js';
import type {
  CreateMemberProfileDto,
  UpdateMemberProfileDto,
} from './dto/member-profile.dto.js';

type ProfileData = {
  avatar?: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: string;
  fitnessGoal?: string;
  healthNotes?: string;
  emergencyContact?: { name: string; phone: string };
};

@Injectable()
export class MemberProfileService {
  constructor(private readonly memberProfileRepo: MemberProfileRepository) {}

  // Maps the nested `emergencyContact` wire shape onto the flat Prisma
  // columns. Both create and update need this same mapping, so it's
  // factored out once here.
  private toDbData(data: ProfileData) {
    return {
      ...(data.avatar !== undefined && { avatar: data.avatar }),
      ...(data.phone !== undefined && { phone: data.phone }),
      ...(data.dateOfBirth !== undefined && {
        dateOfBirth: new Date(data.dateOfBirth),
      }),
      ...(data.gender !== undefined && { gender: data.gender as any }),
      ...(data.fitnessGoal !== undefined && {
        fitnessGoal: data.fitnessGoal as any,
      }),
      ...(data.healthNotes !== undefined && { healthNotes: data.healthNotes }),
      ...(data.emergencyContact !== undefined && {
        emergencyContactName: data.emergencyContact.name,
        emergencyContactPhone: data.emergencyContact.phone,
      }),
    };
  }

  // Re-nests the flat DB columns back into `emergencyContact: {name,
  // phone}` for every response — keeps the API's wire shape identical to
  // Express's Mongoose-embedded original, regardless of how Postgres
  // actually stores it.
  private toApiShape(profile: any) {
    const { emergencyContactName, emergencyContactPhone, ...rest } = profile;
    return {
      ...rest,
      emergencyContact:
        emergencyContactName || emergencyContactPhone
          ? { name: emergencyContactName, phone: emergencyContactPhone }
          : undefined,
    };
  }

  /**
   * Equivalent of createMemberProfile — reactivates an existing
   * (possibly soft-deleted) profile with the new data instead of
   * creating a second one for the same user, same reasoning as Express:
   * deleteMyMemberProfile never hard-deletes, so a returning member's
   * profile already exists, just inactive.
   */
  async createMemberProfile(userId: string, dto: CreateMemberProfileDto) {
    if (!dto) {
      throw new ConflictException('Request body is required');
    }
    const existing = await this.memberProfileRepo.findByUserId(userId);

    const dbData = this.toDbData(dto);

    if (existing) {
      const updated = await this.memberProfileRepo.updateByUserId(userId, {
        ...dbData,
        isActive: true,
      });
      return this.toApiShape(updated);
    }

    const created = await this.memberProfileRepo.create(userId, dbData);
    return this.toApiShape(created);
  }

  async getMyMemberProfile(userId: string) {
    const profile = await this.memberProfileRepo.findActiveByUserId(userId);
    if (!profile) throw new NotFoundException('Member profile not found');
    return this.toApiShape(profile);
  }

  // Equivalent of MemberProfileRepo.findMemberProfileByUserId — returns
  // the raw active profile or null, no throw. Added for PaymentsService,
  // which needs a checkable null partway through a larger flow (e.g.
  // createCheckoutSession's "member profile not found" check), not an
  // HTTP exception thrown mid-transaction. Kept separate from
  // getMyMemberProfile rather than changing that method's throw
  // behavior, since getMyMemberProfile is already live-tested and its
  // contract (throw on missing) is relied on by its own controller route.
  findActiveProfileByUserId(userId: string) {
    return this.memberProfileRepo.findActiveByUserId(userId);
  }

  async updateMyMemberProfile(userId: string, dto: UpdateMemberProfileDto) {
    if (!dto || Object.keys(dto).length === 0) {
      throw new ConflictException('At least one field must be provided');
    }

    const profile = await this.memberProfileRepo.findActiveByUserId(userId);
    if (!profile) throw new NotFoundException('Member profile not found');

    const updated = await this.memberProfileRepo.updateByUserId(
      userId,
      this.toDbData(dto),
    );
    return this.toApiShape(updated);
  }

  // Soft delete. The transaction (remove enrollments + deactivate
  // profile) lives in the repository; the service decides that "no active
  // profile" means a 404.
  async deleteMyMemberProfile(userId: string) {
    const deleted =
      await this.memberProfileRepo.deactivateWithEnrollmentCleanup(userId);
    if (!deleted) throw new NotFoundException('Member profile not found');

    return { message: 'Member profile deleted successfully' };
  }

  async getAllMemberProfiles() {
    const profiles = await this.memberProfileRepo.findAllActive();
    return profiles.map((p) => this.toApiShape(p));
  }

  // Admins and trainers may view any member. A member may only view their
  // own profile, so one member can't read another member's private data.
  async getMemberProfileById(
    id: string,
    requester: { id: string; role: string },
  ) {
    const profile = await this.memberProfileRepo.findActiveById(id);
    if (!profile) throw new NotFoundException('Member profile not found');
    if (requester.role === 'member' && profile.userId !== requester.id) {
      throw new ForbiddenException('Access denied');
    }
    return this.toApiShape(profile);
  }
}
