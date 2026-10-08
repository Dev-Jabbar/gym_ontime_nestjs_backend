import { Injectable, Logger } from '@nestjs/common';
import { PaymentsService } from '../payments/payments.service.js';
import { ClassesService } from '../classes/classes.service.js';
import { HARD_EXPIRY_HOURS, staleAfterMinutes } from './queue.config.js';

export interface SweepResult {
  checked: number;
  resolved: number;
  unresolved: number;
  hardExpired: number;
  holdsReleased: number;
}

/**
 * The work done by the repeatable "sweep" job (replaces the Express
 * node-cron payment cleanup). It only calls existing services: no data
 * access of its own.
 *
 * Idempotent by construction: verifyPayment is the single source of truth
 * and is safe to repeat, and releaseExpiredHolds only deletes holds that
 * are already expired. A retried or overlapping run can't double-apply.
 */
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly classesService: ClassesService,
  ) {}

  async runSweep(): Promise<SweepResult> {
    const stale = await this.paymentsService.findStalePending(
      staleAfterMinutes(),
    );
    const hardExpiry = Date.now() - HARD_EXPIRY_HOURS * 60 * 60 * 1000;

    let resolved = 0;
    let unresolved = 0;
    let hardExpired = 0;

    // One bad reference must not stop the rest of the batch, so each
    // payment gets its own try/catch.
    for (const payment of stale) {
      const reference = payment.paystackReference as string;
      try {
        // Persists completed / needsReview, runs subscription creation and
        // enrollment on success. Same code path as a user-triggered verify.
        await this.paymentsService.verifyPayment(reference);
        resolved++;
        this.logger.log(`Resolved stale payment ${reference}`);
      } catch (err) {
        // Paystack said "not successful" (verifyPayment already marked it
        // failed and released the hold) or the check itself errored.
        unresolved++;
        this.logger.warn(
          `Could not resolve ${reference} this pass: ${(err as Error).message}`,
        );

        // Safety net: never leave a reference pending forever.
        if (payment.createdAt.getTime() < hardExpiry) {
          if (await this.paymentsService.expireIfStillPending(reference)) {
            hardExpired++;
            this.logger.warn(
              `Hard-expired ${reference} after ${HARD_EXPIRY_HOURS}h unresolved`,
            );
          }
        }
      }
    }

    const released = await this.classesService.releaseExpiredHolds();

    const result: SweepResult = {
      checked: stale.length,
      resolved,
      unresolved,
      hardExpired,
      holdsReleased: released.count,
    };
    this.logger.log(`Sweep complete: ${JSON.stringify(result)}`);
    return result;
  }
}
