import { Controller, Post, UseGuards } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { MAINTENANCE_QUEUE, SWEEP_JOB } from './queue.constants.js';
import { SWEEP_JOB_OPTIONS } from './maintenance.scheduler.js';

// Admin-only manual trigger, handy for testing the abandon -> failed ->
// hold released flow without waiting for the 15-minute schedule.
@Controller('maintenance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class MaintenanceController {
  constructor(@InjectQueue(MAINTENANCE_QUEUE) private readonly queue: Queue) {}

  @Post('run')
  async runNow() {
    const job = await this.queue.add(SWEEP_JOB, {}, SWEEP_JOB_OPTIONS);
    return {
      success: true,
      message: 'Sweep queued. Watch the server log for the result.',
      data: { jobId: job.id },
    };
  }
}
