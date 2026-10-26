import { Module } from '@nestjs/common';
import { MemberProfileService } from './member-profile.service.js';
import { MemberProfileRepository } from './member-profile.repository.js';
import { MemberProfileController } from './member-profile.controller.js';
import { JwtGuardsModule } from '../auth/jwt-guards.module.js';

// Exported because PaymentsService needs findActiveProfileByUserId to resolve
// a member's profile id before calling the seat-hold methods, which are keyed
// by memberProfileId rather than userId.
@Module({
  imports: [JwtGuardsModule],
  controllers: [MemberProfileController],
  providers: [MemberProfileService, MemberProfileRepository],
  exports: [MemberProfileService],
})
export class MemberProfileModule {}
