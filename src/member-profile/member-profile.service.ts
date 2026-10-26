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
  // columns. Create and update share this mapping.
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

  // Re-nests the flat database columns into `emergencyContact: { name, phone }`
  // so the API's wire shape does not depend on how Postgres stores it.
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
   * Creates a member profile, or reactivates an existing (possibly
   * soft-deleted) one with the new data instead of creating a second profile
   * for the same user. Deleting a profile never hard-deletes it, so a
   * returning member's profile already exists, just inactive.
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

  // Returns the raw active profile, or null instead of throwing. Used by
  // PaymentsService, which needs a checkable null partway through a larger
  // flow rather than an HTTP exception. Kept separate from getMyMemberProfile,
  // whose contract is to throw when the profile is missing.
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

  // Soft delete. The repository runs the transaction (remove enrollments and
  // deactivate the profile); the service decides that "no active profile"
  // means a 404.
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

  // Admins and trainers may view any member. A member may only view their own
  // profile, so one member cannot read another member's private data.
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
