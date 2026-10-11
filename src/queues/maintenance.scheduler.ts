import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  CLASS_REMINDER_JOB,
  CLASS_REMINDER_SCHEDULER_ID,
  MAINTENANCE_QUEUE,
  SUBSCRIPTION_EXPIRY_JOB,
  SUBSCRIPTION_EXPIRY_SCHEDULER_ID,
  SWEEP_JOB,
  SWEEP_SCHEDULER_ID,
} from './queue.constants.js';
import {
  classReminderIntervalMs,
  subscriptionExpiryIntervalMs,
  sweepIntervalMs,
} from './queue.config.js';

// Shared retry policy for every sweep job: 3 attempts, exponential
// backoff starting at 30s (30s, 60s). Per-payment failures are handled
// inside the sweep, so a job only fails on infrastructure problems.
// Old jobs are trimmed so Redis doesn't fill up.
export const SWEEP_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: { count: 20 },
  removeOnFail: { count: 50 },
} as const;

@Injectable()
export class MaintenanceScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(MaintenanceScheduler.name);

  constructor(@InjectQueue(MAINTENANCE_QUEUE) private readonly queue: Queue) {}

  onApplicationBootstrap() {
    // Queue errors (e.g. Redis down) must not crash the API.
    this.queue.on('error', (err) =>
      this.logger.warn(`Queue error: ${err.message || err.name}`),
    );

    // Fire and forget: if Redis is unreachable at boot this retries in the
    // background instead of blocking startup. upsert is idempotent, so
    // restarts (and several API instances) never create duplicate schedules.
    void this.queue
      .upsertJobScheduler(
        SWEEP_SCHEDULER_ID,
        { every: sweepIntervalMs() },
        { name: SWEEP_JOB, opts: SWEEP_JOB_OPTIONS },
      )
      .then(() =>
        this.logger.log(
          `Sweep scheduled every ${sweepIntervalMs() / 60000} minute(s)`,
        ),
      )
      .catch((err: Error) =>
        this.logger.error(`Could not schedule sweep: ${err.message}`),
      );

    // Same idea for the hourly subscription-expiry job (a separate
    // scheduler id, so the two schedules never overwrite each other).
    void this.queue
      .upsertJobScheduler(
        SUBSCRIPTION_EXPIRY_SCHEDULER_ID,
        { every: subscriptionExpiryIntervalMs() },
        { name: SUBSCRIPTION_EXPIRY_JOB, opts: SWEEP_JOB_OPTIONS },
      )
      .then(() =>
        this.logger.log(
          `Subscription expiry scheduled every ${subscriptionExpiryIntervalMs() / 60000} minute(s)`,
        ),
      )
      .catch((err: Error) =>
        this.logger.error(
          `Could not schedule subscription expiry: ${err.message}`,
        ),
      );

    // Third schedule: class reminders (own scheduler id, same retry policy).
    void this.queue
      .upsertJobScheduler(
        CLASS_REMINDER_SCHEDULER_ID,
        { every: classReminderIntervalMs() },
        { name: CLASS_REMINDER_JOB, opts: SWEEP_JOB_OPTIONS },
      )
      .then(() =>
        this.logger.log(
          `Class reminders scheduled every ${classReminderIntervalMs() / 60000} minute(s)`,
        ),
      )
      .catch((err: Error) =>
        this.logger.error(`Could not schedule class reminders: ${err.message}`),
      );
  }
}
