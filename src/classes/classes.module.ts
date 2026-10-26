import { Module } from '@nestjs/common';
import { ClassesService } from './classes.service.js';
import { ClassesRepository } from './classes.repository.js';
import { ClassesController } from './classes.controller.js';
import { ClassEvents } from './class-events.service.js';
import { ClassesGateway } from './classes.gateway.js';
import { JwtGuardsModule } from '../auth/jwt-guards.module.js';

// Imports JwtGuardsModule directly (the same pattern as UsersModule): the
// controller's admin and trainer routes need JwtAuthGuard and RolesGuard, and
// those must be imported from their actual home, not via another feature
// module.
@Module({
  controllers: [ClassesController],
  providers: [ClassesService, ClassesRepository, ClassEvents, ClassesGateway],
  exports: [ClassesService],
  imports: [JwtGuardsModule],
})
export class ClassesModule {}
