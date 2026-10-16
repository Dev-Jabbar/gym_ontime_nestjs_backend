import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TrainerProfileRepository } from './trainer-profile.repository.js';
import { ClassesService } from '../classes/classes.service.js';
import { forViewer } from './trainer-privacy.util.js';
import type {
  CreateTrainerProfileDto,
  UpdateTrainerProfileDto,
} from './dto/trainer-profile.dto.js';

@Injectable()
export class TrainerProfileService {
  constructor(
    private readonly trainerProfileRepo: TrainerProfileRepository,
    private readonly classesService: ClassesService,
  ) {}

  // Only copies fields the caller actually sent, so an update never wipes
  // a column by writing `undefined` over it.
  private toDbData(data: CreateTrainerProfileDto) {
    return {
      ...(data.avatar !== undefined && { avatar: data.avatar }),
      ...(data.bio !== undefined && { bio: data.bio }),
      ...(data.specialty !== undefined && { specialty: data.specialty }),
      ...(data.phone !== undefined && { phone: data.phone }),
      ...(data.experience !== undefined && { experience: data.experience }),
      ...(data.certifications !== undefined && {
        certifications: data.certifications,
      }),
      ...(data.availability !== undefined && {
        availability: data.availability,
      }),
      ...(data.dateOfBirth !== undefined && {
        dateOfBirth: new Date(data.dateOfBirth),
      }),
      ...(data.gender !== undefined && { gender: data.gender as any }),
    };
  }

  /**
   * Equivalent of createTrainerProfile — reactivates an existing (possibly
   * soft-deleted) profile instead of creating a second row, same as
   * Express and same as member-profile.
   */
  async createTrainerProfile(userId: string, dto: CreateTrainerProfileDto) {
    if (!dto) throw new ConflictException('Request body is required');

    const existing = await this.trainerProfileRepo.findByUserId(userId);
    const dbData = this.toDbData(dto);

    if (existing) {
      return this.trainerProfileRepo.updateByUserId(userId, {
        ...dbData,
        isActive: true,
      });
    }
    return this.trainerProfileRepo.create(userId, dbData);
  }

  async getMyTrainerProfile(userId: string) {
    const profile = await this.trainerProfileRepo.findActiveByUserId(userId);
    if (!profile) throw new NotFoundException('Trainer profile not found');
    return profile;
  }

  async updateMyTrainerProfile(userId: string, dto: UpdateTrainerProfileDto) {
    if (!dto || Object.keys(dto).length === 0) {
      throw new ConflictException('At least one field must be provided');
    }
    const profile = await this.trainerProfileRepo.findActiveByUserId(userId);
    if (!profile) throw new NotFoundException('Trainer profile not found');

    return this.trainerProfileRepo.updateByUserId(userId, this.toDbData(dto));
  }

  // Soft delete + unassign from classes. The transaction lives in the
  // repository; the service decides "no active profile" means a 404.
  // Leaves the trainer's classes trainerless, same as Express and same as
  // UsersService.softDelete.
  async deleteMyTrainerProfile(userId: string) {
    const deleted =
      await this.trainerProfileRepo.deactivateAndUnassignClasses(userId);
    if (!deleted) throw new NotFoundException('Trainer profile not found');

    return { message: 'Trainer profile deleted successfully' };
  }

  async getAllTrainerProfiles(viewerRole: string) {
    const profiles = await this.trainerProfileRepo.findAllActive();
    return profiles.map((p) => forViewer(p, viewerRole));
  }

  async getTrainerProfileById(id: string, viewerRole: string) {
    const profile = await this.trainerProfileRepo.findActiveById(id);
    if (!profile) throw new NotFoundException('Trainer profile not found');
    return forViewer(profile, viewerRole);
  }

  // Reuses ClassesService's transformClass shaping (via a public wrapper)
  // instead of duplicating it, so /trainers/my-classes returns classes in
  // exactly the same shape as /classes.
  async getMyClasses(userId: string) {
    const profile = await this.trainerProfileRepo.findActiveByUserId(userId);
    if (!profile) throw new NotFoundException('Trainer profile not found');

    const classes = await this.classesService.getClassesByTrainerProfileId(
      profile.id,
    );
    return { success: true, data: classes };
  }
}
