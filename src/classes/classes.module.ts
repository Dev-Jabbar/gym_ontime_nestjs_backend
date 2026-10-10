import { Module } from '@nestjs/common';
import { ClassesService } from './classes.service.js';
import { ClassesRepository } from './classes.repository.js';
import { ClassesController } from './classes.controller.js';
import { ClassEvents } from './class-events.service.js';
import { ClassesGateway } from './classes.gateway.js';
import { JwtGuardsModule } from '../auth/jwt-guards.module.js';

// Imports JwtGuardsModule directly (same pattern as UsersModule) — this
// controller's admin/trainer routes need JwtAuthGuard/RolesGuard, and the
// lesson from Step 1.5 was: import the guards' actual home directly,
// don't route through another feature module.
@Module({
  controllers: [ClassesController],
  providers: [ClassesService, ClassesRepository, ClassEvents, ClassesGateway],
  exports: [ClassesService],
  imports: [JwtGuardsModule],
})
export class ClassesModule {}
