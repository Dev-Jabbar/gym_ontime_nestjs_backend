import { Module } from '@nestjs/common';
import { TrainerProfileService } from './trainer-profile.service.js';
import { TrainerProfileRepository } from './trainer-profile.repository.js';
import { TrainerProfileController } from './trainer-profile.controller.js';
import { JwtGuardsModule } from '../auth/jwt-guards.module.js';
import { ClassesModule } from '../classes/classes.module.js';

@Module({
  imports: [JwtGuardsModule, ClassesModule],
  controllers: [TrainerProfileController],
  providers: [TrainerProfileService, TrainerProfileRepository],
})
export class TrainerProfileModule {}
