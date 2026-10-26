import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { NotificationsRepository } from './notifications.repository.js';
import { DeviceTokensRepository } from './device-tokens.repository.js';
import { PushService } from './push.service.js';
import { NotificationsController } from './notifications.controller.js';
import { JwtGuardsModule } from '../auth/jwt-guards.module.js';

// Exported because PaymentsService and the class-reminder job both call
// notify() directly.
@Module({
  imports: [JwtGuardsModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsRepository,
    DeviceTokensRepository,
    PushService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
