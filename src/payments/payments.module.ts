import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service.js';
import { PaymentsRepository } from './payments.repository.js';
import { PaymentsController } from './payments.controller.js';
import { JwtGuardsModule } from '../auth/jwt-guards.module.js';
import { UsersModule } from '../users/users.module.js';
import { MemberProfileModule } from '../member-profile/member-profile.module.js';
import { ClassesModule } from '../classes/classes.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

// The largest dependency list of any module so far — mirrors how many
// other services Express's payment.service.ts imports directly
// (user.repository, class.repository, member-profile.repository,
// class-subscription.repository, notification.service). JwtGuardsModule
// for the guards; the other four for the actual cross-feature calls
// PaymentsService makes (findById, findActiveProfileByUserId,
// reserveSeat/confirmSeat/releaseSeat/getClassEnrollmentStatus/
// findClassById, notify).
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
