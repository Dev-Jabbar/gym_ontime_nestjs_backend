import { Module } from '@nestjs/common';
import { AdminProfileService } from './admin-profile.service.js';
import { AdminProfileRepository } from './admin-profile.repository.js';
import { AdminProfileController } from './admin-profile.controller.js';
import { JwtGuardsModule } from '../auth/jwt-guards.module.js';

@Module({
  imports: [JwtGuardsModule],
  controllers: [AdminProfileController],
  providers: [AdminProfileService, AdminProfileRepository],
})
export class AdminProfileModule {}
