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

export interface SubscriptionExpiryResult {
  checked: number;
  expired: number;
  membersRemoved: number;
  failed: number;
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

  /**
   * Port of the Express subscriptionExpiry job: every subscription still
   * "active" whose endDate has passed is marked "expired" and the member is
   * removed from the class (otherwise they would stay enrolled, and count
   * toward capacity, forever).
   *
   * Order differs from Express on purpose: the member is removed FIRST and
   * the status flipped LAST. If a step fails, the subscription is still
   * "active", so the next hourly run retries it. (Flipping first, as Express
   * did, would leave a lapsed member enrolled forever when removal failed.)
   * Both steps are safe to repeat, so a retried or overlapping run can't
   * double-apply.
   */
  async runSubscriptionExpiry(): Promise<SubscriptionExpiryResult> {
    const due = await this.paymentsService.findExpiredSubscriptions();

    let expired = 0;
    let membersRemoved = 0;
    let failed = 0;

    // One bad subscription must not stop the rest, so each gets its own
    // try/catch.
    for (const sub of due) {
      try {
        const removed = await this.classesService.removeMemberByProfileId(
          sub.classId,
          sub.memberProfileId,
        );
        if (removed) membersRemoved++;

        if (await this.paymentsService.expireSubscription(sub.id)) {
          expired++;
          this.logger.log(
            `Expired subscription ${sub.id} (class ${sub.classId}, member removed: ${removed})`,
          );
        }
      } catch (err) {
        failed++;
        this.logger.warn(
          `Could not fully process expired subscription ${sub.id}: ${(err as Error).message}`,
        );
      }
    }

    const result: SubscriptionExpiryResult = {
      checked: due.length,
      expired,
      membersRemoved,
      failed,
    };
    this.logger.log(`Subscription expiry complete: ${JSON.stringify(result)}`);
    return result;
  }
}
