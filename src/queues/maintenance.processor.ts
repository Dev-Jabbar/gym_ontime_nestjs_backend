import { Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import {
  MAINTENANCE_QUEUE,
  SUBSCRIPTION_EXPIRY_JOB,
  SWEEP_JOB,
} from './queue.constants.js';
import {
  MaintenanceService,
  type SubscriptionExpiryResult,
  type SweepResult,
} from './maintenance.service.js';

// Thin on purpose: route the job to MaintenanceService. concurrency 1 so
// two sweeps never run at once on this instance.
@Processor(MAINTENANCE_QUEUE, { concurrency: 1 })
export class MaintenanceProcessor extends WorkerHost {
  private readonly logger = new Logger(MaintenanceProcessor.name);

  constructor(private readonly maintenance: MaintenanceService) {
    super();
  }

  async process(job: Job): Promise<SweepResult | SubscriptionExpiryResult | void> {
    if (job.name === SWEEP_JOB) return this.maintenance.runSweep();
    if (job.name === SUBSCRIPTION_EXPIRY_JOB) {
      return this.maintenance.runSubscriptionExpiry();
    }
    this.logger.warn(`Ignoring unknown job "${job.name}" (id ${job.id})`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, err: Error) {
    const attempt = job ? `${job.attemptsMade}/${job.opts.attempts ?? 1}` : '?';
    this.logger.error(
      `Job ${job?.name} (id ${job?.id}) failed, attempt ${attempt}: ${err.message}`,
    );
  }

  // Without a listener, a Redis connection error on the worker would be an
  // unhandled 'error' event. Log it; BullMQ reconnects on its own.
  @OnWorkerEvent('error')
  onError(err: Error) {
    this.logger.warn(`Queue worker error: ${err.message || err.name}`);
  }
}
