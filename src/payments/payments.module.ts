import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service.js';
import { PaymentsRepository } from './payments.repository.js';
import { PaymentsController } from './payments.controller.js';
import { JwtGuardsModule } from '../auth/jwt-guards.module.js';
import { UsersModule } from '../users/users.module.js';
import { MemberProfileModule } from '../member-profile/member-profile.module.js';
import { ClassesModule } from '../classes/classes.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

// This module has the largest dependency list because PaymentsService
// coordinates several features: UsersModule (findById), MemberProfileModule
// (findActiveProfileByUserId), ClassesModule (the seat-hold methods and
// findClassById) and NotificationsModule (notify). JwtGuardsModule provides
// the guards.
@Module({
  imports: [
    JwtGuardsModule,
    UsersModule,
    MemberProfileModule,
    ClassesModule,
    NotificationsModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsRepository],
  exports: [PaymentsService],
})
export class PaymentsModule {}
