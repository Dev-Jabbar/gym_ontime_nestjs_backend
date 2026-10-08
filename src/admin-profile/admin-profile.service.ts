import { Injectable } from '@nestjs/common';
import { AdminProfileRepository } from './admin-profile.repository.js';

@Injectable()
export class AdminProfileService {
  constructor(private readonly adminProfileRepo: AdminProfileRepository) {}

  // Returns { avatar: null } instead of a 404 when no profile row exists:
  // admin accounts are seeded, not registered, so the first visit may
  // have no row yet.
  async getMyAdminProfile(userId: string) {
    const profile = await this.adminProfileRepo.findByUserId(userId);
    return profile ?? { avatar: null };
  }

  updateMyAdminProfile(userId: string, data: { avatar?: string }) {
    return this.adminProfileRepo.upsertByUserId(userId, data);
  }
}
