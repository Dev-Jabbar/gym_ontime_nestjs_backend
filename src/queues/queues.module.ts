import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { JwtGuardsModule } from '../auth/jwt-guards.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { ClassesModule } from '../classes/classes.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { MAINTENANCE_QUEUE } from './queue.constants.js';
import { QUEUE_PREFIX, buildQueueConnection } from './queue.config.js';
import { MaintenanceService } from './maintenance.service.js';
import { MaintenanceProcessor } from './maintenance.processor.js';
import { MaintenanceScheduler } from './maintenance.scheduler.js';
import { MaintenanceController } from './maintenance.controller.js';

// Only added to AppModule when REDIS_URL is set (see app.module.ts), so
// running without Redis still works, just without the scheduled sweep.
@Module({
  imports: [
    // forRootAsync: the factory runs only when this module is actually
    // instantiated, NOT when the file is imported. A plain forRoot({
    // connection: buildQueueConnection() }) would read REDIS_URL at import
    // time and crash the whole app with `Invalid URL` when it is unset.
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: buildQueueConnection(),
        prefix: QUEUE_PREFIX,
      }),
    }),
    BullModule.registerQueue({ name: MAINTENANCE_QUEUE }),
    JwtGuardsModule,
    PaymentsModule,
    ClassesModule,
    NotificationsModule,
  ],
  controllers: [MaintenanceController],
  providers: [MaintenanceService, MaintenanceProcessor, MaintenanceScheduler],
})
export class QueuesModule {}
