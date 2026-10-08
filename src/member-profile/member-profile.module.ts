import { Module } from '@nestjs/common';
import { MemberProfileService } from './member-profile.service.js';
import { MemberProfileRepository } from './member-profile.repository.js';
import { MemberProfileController } from './member-profile.controller.js';
import { JwtGuardsModule } from '../auth/jwt-guards.module.js';

// Exported: PaymentsService needs findActiveProfileByUserId to resolve
// a member's profile ID before it can call ClassesService's seat-hold
// methods (which key on memberProfileId, not userId), same as Express's
// payment.service.ts imports member-profile.repository.ts directly.
@Module({
  imports: [JwtGuardsModule],
  controllers: [MemberProfileController],
  providers: [MemberProfileService, MemberProfileRepository],
  exports: [MemberProfileService],
})
export class MemberProfileModule {}
