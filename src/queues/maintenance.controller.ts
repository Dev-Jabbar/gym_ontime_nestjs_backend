import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Controller, Post, UseGuards } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import {
  CLASS_REMINDER_JOB,
  MAINTENANCE_QUEUE,
  SUBSCRIPTION_EXPIRY_JOB,
  SWEEP_JOB,
} from './queue.constants.js';
import { SWEEP_JOB_OPTIONS } from './maintenance.scheduler.js';

// Admin-only manual trigger, useful for testing the abandoned-payment flow
// (abandon, mark failed, release hold) without waiting for the schedule.
@ApiTags('Maintenance (admin)')
@Controller('maintenance')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class MaintenanceController {
  constructor(@InjectQueue(MAINTENANCE_QUEUE) private readonly queue: Queue) {}

  @ApiOperation({ summary: 'Run the payment sweep now', description: 'Allowed roles: admin.' })
  @Post('run')
  async runNow() {
    const job = await this.queue.add(SWEEP_JOB, {}, SWEEP_JOB_OPTIONS);
    return {
      success: true,
      message: 'Sweep queued. Watch the server log for the result.',
      data: { jobId: job.id },
    };
  }

  // Manual trigger for the subscription-expiry job, so it can be exercised
  // without waiting an hour.
  @ApiOperation({ summary: 'Expire ended subscriptions now', description: 'Allowed roles: admin.' })
  @Post('expire-subscriptions')
  async expireSubscriptionsNow() {
    const job = await this.queue.add(
      SUBSCRIPTION_EXPIRY_JOB,
      {},
      SWEEP_JOB_OPTIONS,
    );
    return {
      success: true,
      message: 'Subscription expiry queued. Watch the server log for the result.',
      data: { jobId: job.id },
    };
  }

  // Manual trigger for class reminders.
  @ApiOperation({ summary: 'Send class reminders now', description: 'Allowed roles: admin.' })
  @Post('class-reminders')
  async classRemindersNow() {
    const job = await this.queue.add(CLASS_REMINDER_JOB, {}, SWEEP_JOB_OPTIONS);
    return {
      success: true,
      message: 'Class reminders queued. Watch the server log for the result.',
      data: { jobId: job.id },
    };
  }
}
