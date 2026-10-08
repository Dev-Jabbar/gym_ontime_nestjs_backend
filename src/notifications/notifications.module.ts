import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { NotificationsRepository } from './notifications.repository.js';
import { NotificationsController } from './notifications.controller.js';
import { JwtGuardsModule } from '../auth/jwt-guards.module.js';

// Exported: PaymentsService (once ported) and the class-reminder job
// (once Step 5's Bull Queue exists) both need to call notify() directly,
// same as Express's payment.service.ts/classReminder.job.ts import
// notification.service.ts's notify function today.
@Module({
  imports: [JwtGuardsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsRepository],
  exports: [NotificationsService],
})
export class NotificationsModule {}
