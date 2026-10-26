import { Injectable, UnauthorizedException } from '@nestjs/common';
import axios from 'axios';
import crypto from 'crypto';
import { PaymentsRepository } from './payments.repository.js';
import { UsersService } from '../users/users.service.js';
import { MemberProfileService } from '../member-profile/member-profile.service.js';
import { ClassesService } from '../classes/classes.service.js';
import { isPastOneOffClass } from '../classes/class-timing.util.js';
import { NotificationsService } from '../notifications/notifications.service.js';

const PAYSTACK_BASE_URL = 'https://api.paystack.co';
const SEAT_HOLD_MINUTES = 15;

type ApiSubscriptionInterval = 'weekly' | 'monthly' | 'threeMonths';
type ApiPaymentType = 'one-time' | 'subscription';

const SUBSCRIPTION_INTERVALS: ApiSubscriptionInterval[] = [
  'weekly',
  'monthly',
  'threeMonths',
];

// Prisma's PaymentType enum uses an underscore (`one_time`) because Postgres
// enum identifiers cannot contain a hyphen. The API contract uses `one-time`,
// so this is the one field that needs an explicit two-way mapping between the
// database and the wire format. Every other enum value is identical in both.
const toDbPaymentType = (t: ApiPaymentType) =>
  t === 'one-time' ? 'one_time' : 'subscription';
const toApiPaymentType = (t: string): ApiPaymentType =>
  t === 'one_time' ? 'one-time' : 'subscription';

function calculateEndDate(
  startDate: Date,
  interval: ApiSubscriptionInterval,
): Date {
  const endDate = new Date(startDate);
  switch (interval) {
    case 'weekly':
      endDate.setDate(endDate.getDate() + 7);
      break;
    case 'monthly':
      endDate.setMonth(endDate.getMonth() + 1);
      break;
    case 'threeMonths':
      endDate.setMonth(endDate.getMonth() + 3);
      break;
  }
  return endDate;
}

interface PaystackInitializeResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data: {
    status: string;
    reference: string;
    amount: number;
    currency: string;
    metadata: any;
  };
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly paymentsRepo: PaymentsRepository,
    private readonly usersService: UsersService,
    private readonly memberProfileService: MemberProfileService,
    private readonly classesService: ClassesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // Shapes a Prisma Payment row for the API: converts the `Decimal` amount to
  // a number and maps the `one_time` enum value to the wire format's
  // `one-time`. Ids are sent as `id` (also on the nested `user` and `class`);
  // the frontend reads `_id ?? id`, so it works with this API and with the
  // Express one.
  private toApiShape(payment: any) {
    return {
      ...payment,
      amount: Number(payment.amount),
      paymentType: toApiPaymentType(payment.paymentType),
    };
  }

  /**
   * Starts a checkout: validates the booking, places a 15-minute seat hold,
   * then asks Paystack for a checkout URL. The hold is released if either the
   * Paystack call or saving the payment record fails, so a seat is never
   * locked for a checkout that did not start.
   */
  async createCheckoutSession({
    userId,
    classId,
    paymentType,
    subscriptionInterval,
  }: {
    userId: string;
    classId: string;
    paymentType: ApiPaymentType;
    subscriptionInterval?: ApiSubscriptionInterval;
  }) {
    const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY as string;
    if (!paystackSecretKey) {
      throw new Error('Paystack secret key is not configured');
    }
    if (!process.env.FRONTEND_URL) {
      throw new Error('FRONTEND_URL is not configured');
    }

    if (paymentType === 'subscription') {
      if (!subscriptionInterval) {
        throw new Error(
          'Subscription interval is required for subscription payments',
        );
      }
      if (!SUBSCRIPTION_INTERVALS.includes(subscriptionInterval)) {
        throw new Error(
          `Invalid subscription interval: ${subscriptionInterval}`,
        );
      }
    }

    const user = await this.usersService.findById(userId);
    if (!user) throw new Error('User not found');
    if (user.role !== 'member') {
      throw new Error('Only members can enroll in paid classes');
    }

    const memberProfile =
      await this.memberProfileService.findActiveProfileByUserId(userId);
    if (!memberProfile) throw new Error('Member profile not found');

    // findClassById throws NotFoundException when the class is missing, so
    // no separate existence check is needed here.
    const classItem = await this.classesService.findClassById(classId);

    // A one-off class that has already started can no longer be booked (the
    // same rule as the admin add-member route). Recurring classes stay
    // bookable. This only guards new bookings: a payment started before the
    // class begins is still confirmed afterwards by verify, the webhook or
    // the sweep.
    if (isPastOneOffClass(classItem)) {
      throw new Error(
        'This class has already started or ended and can no longer be booked.',
      );
    }

    if (paymentType === 'subscription' && classItem.recurrence === 'none') {
      throw new Error(
        'Subscriptions are not available for one-off classes. Please use one-time payment.',
      );
    }

    let amount: number;
    if (paymentType === 'one-time') {
      const price = classItem.pricing.oneTime;
      if (!price) {
        throw new Error('This class does not support one-time payments');
      }
      amount = price;
    } else {
      const price = classItem.pricing[subscriptionInterval as ApiSubscriptionInterval];
      if (!price) {
        throw new Error(
          `This class does not support ${subscriptionInterval} subscriptions`,
        );
      }
      amount = price;
    }

    if (paymentType === 'one-time') {
      const existingPayment = await this.paymentsRepo.findCompletedPayment(
        userId,
        classId,
      );
      if (existingPayment) {
        throw new Error('You are already enrolled in this class');
      }
    } else {
      const existingSubscription = await this.paymentsRepo.findActiveSubscription(
        userId,
        classId,
      );
      if (existingSubscription) {
        throw new Error(
          'You already have an active subscription for this class',
        );
      }
    }

    // Atomically claims a seat and holds it for this member for
    // SEAT_HOLD_MINUTES. Throws NotFoundException (class missing) or
    // ConflictException with a specific reason (already enrolled, active
    // hold, class full); both propagate to the controller unchanged.
    const memberProfileId = memberProfile.id;
    await this.classesService.reserveSeat(
      classId,
      memberProfileId,
      SEAT_HOLD_MINUTES,
    );

    let data: PaystackInitializeResponse;
    try {
      const response = await axios.post<PaystackInitializeResponse>(
        `${PAYSTACK_BASE_URL}/transaction/initialize`,
        {
          email: user.email,
          amount: amount * 100,
          currency: 'NGN',
          callback_url: `${process.env.FRONTEND_URL}/payment-success`,
          metadata: {
            userId,
            classId,
            userName: user.name,
            className: classItem.name,
            paymentType,
            subscriptionInterval,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${paystackSecretKey}`,
            'Content-Type': 'application/json',
          },
        },
      );
      data = response.data;
    } catch (err) {
      // Paystack initialisation failed: release the hold rather than lock the
      // seat for 15 minutes over a checkout that never started.
      await this.classesService.releaseSeat(classId, memberProfileId);
      throw err;
    }

    try {
      await this.paymentsRepo.create({
        userId,
        classId,
        amount,
        currency: 'NGN',
        paystackReference: data.data.reference,
        paystackAccessCode: data.data.access_code,
        status: 'pending',
        provider: 'paystack',
        method: 'card',
        paymentType: toDbPaymentType(paymentType),
        subscriptionInterval,
      });
    } catch (err) {
      // Paystack has a live session but our payment record was not saved:
      // release the hold, because verifyPayment could never find this payment.
      await this.classesService.releaseSeat(classId, memberProfileId);
      throw new Error(
        `Failed to save payment record. Please contact support with reference: ${data.data.reference}`,
      );
    }

    return {
      checkoutUrl: data.data.authorization_url,
      reference: data.data.reference,
    };
  }

  // Converts the member's hold into a confirmed seat. Internal: only
  // verifyPayment calls it.
  async claimSeat(
    classId: string,
    memberProfileId: string,
  ): Promise<
    'enrolled' | 'already-enrolled' | 'hold-expired' | 'class-full' | 'error'
  > {
    const updated = await this.classesService.confirmSeat(
      classId,
      memberProfileId,
    );
    if (updated) return 'enrolled';

    const reason = await this.classesService.getClassEnrollmentStatus(
      classId,
      memberProfileId,
    );
    if (
      reason === 'already-enrolled' ||
      reason === 'hold-expired' ||
      reason === 'class-full'
    ) {
      return reason;
    }
    return 'error';
  }

  // Alerts every active admin that a charged payment lost its seat. Looking
  // up the member and class names is best effort; this method never throws.
  private async alertAdminsPaymentNeedsReview(payment: {
    id: string;
    userId: string;
    classId: string | null;
    paystackReference: string | null;
  }) {
    try {
      let memberName = 'A member';
      let className = 'a class';
      try {
        const user = await this.usersService.findById(payment.userId);
        if (user?.name) memberName = user.name;
      } catch {
        // Fall back to the generic wording.
      }
      try {
        if (payment.classId) {
          const name = await this.classesService.findClassName(payment.classId);
          if (name) className = `"${name}"`;
        }
      } catch {
        // Fall back to the generic wording.
      }

      await this.notificationsService.notifyAdmins({
        type: 'payment_needs_review',
        title: 'Payment Needs Review',
        message: `${memberName} paid for ${className} but the seat could not be confirmed. Reference: ${payment.paystackReference ?? payment.id}. Please follow up (refund or re-seat).`,
        classId: payment.classId ?? undefined,
        paymentId: payment.id,
      });
    } catch (err) {
      console.error('Failed to alert admins about a payment review:', err);
    }
  }

  /**
   * The single source of truth for "did this payment actually happen". The
   * member's redirect, the Paystack webhook and the background sweep all call
   * it. It re-verifies the charge with Paystack instead of trusting the
   * caller, and it is idempotent: an already completed payment is returned
   * as is.
   */
  async verifyPayment(reference: string) {
    const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY as string;

    const { data } = await axios.get<PaystackVerifyResponse>(
      `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
      { headers: { Authorization: `Bearer ${paystackSecretKey}` } },
    );

    // Paystack only sends webhooks for successful charges, so this call is
    // the only place a failed or declined charge is ever discovered. Persist
    // `failed` and release the seat hold immediately rather than leaving the
    // record `pending` forever.
    if (data.data.status !== 'success') {
      const payment = await this.paymentsRepo.findByReference(reference);
      if (payment && payment.status === 'pending') {
        await this.paymentsRepo.updateByReference(reference, {
          status: 'failed',
        });

        const memberProfile =
          await this.memberProfileService.findActiveProfileByUserId(
            payment.userId,
          );
        if (memberProfile && payment.classId) {
          await this.classesService.releaseSeat(
            payment.classId,
            memberProfile.id,
          );
        }
      }
      throw new Error('Payment verification failed');
    }

    const payment = await this.paymentsRepo.findByReference(reference);
    if (!payment) throw new Error('Payment record not found');
    if (payment.status === 'completed') {
      return {
        message: 'Payment already processed',
        payment: this.toApiShape(payment),
      };
    }

    const memberProfile =
      await this.memberProfileService.findActiveProfileByUserId(
        payment.userId,
      );
    if (!memberProfile) {
      throw new Error('Member profile not found for this user');
    }

    if (!payment.classId) {
      throw new Error('Payment has no associated class');
    }

    // Claim the seat before marking the payment complete, so a completed
    // payment can never exist without a secured seat behind it.
    const seatResult = await this.claimSeat(payment.classId, memberProfile.id);

    if (seatResult === 'hold-expired' || seatResult === 'class-full') {
      // The charge succeeded but the seat is gone. Flag it for manual review
      // instead of guessing whether to refund or bump someone: that is a
      // business decision, not a code decision.
      const updated = await this.paymentsRepo.updateByReference(reference, {
        needsReview: true,
      });

      await this.notificationsService.notify({
        userId: payment.userId,
        type: 'payment_needs_review',
        title: "We're Looking Into Your Payment",
        message:
          "Your payment went through, but we weren't able to confirm your spot automatically. A team member will follow up shortly.",
        classId: payment.classId ?? undefined,
        paymentId: payment.id,
      });

      // Admins must follow up too (usually a refund or a re-seat). A failure
      // to alert them must never break the response.
      await this.alertAdminsPaymentNeedsReview(payment);

      // Return the freshly updated row so `needsReview` is accurate in the
      // response.
      return {
        message: 'Payment received, pending manual review',
        payment: this.toApiShape(updated),
      };
    }

    if (seatResult === 'error') {
      throw new Error(
        `Unexpected error claiming seat for payment ${reference}`,
      );
    }

    // Seat result is 'enrolled' or 'already-enrolled': safe to continue.
    if (payment.paymentType === 'subscription' && payment.subscriptionInterval) {
      const startDate = new Date();
      const endDate = calculateEndDate(
        startDate,
        payment.subscriptionInterval as ApiSubscriptionInterval,
      );

      // The foreign key lives on ClassSubscription.paymentId; Payment has only
      // a back-relation. Creating the subscription row below is what links
      // the two, so nothing is written to the Payment itself.
      await this.paymentsRepo.createSubscription({
        userId: payment.userId,
        memberProfileId: memberProfile.id,
        classId: payment.classId,
        interval: payment.subscriptionInterval,
        startDate,
        endDate,
        status: 'active',
        paymentId: payment.id,
      });
    }

    const updatedPayment = await this.paymentsRepo.updateByReference(
      reference,
      { status: 'completed' },
    );

    // The class name makes the notification friendlier, but a notification
    // is not worth failing the verification over, so fall back to generic
    // wording if the lookup fails.
    let className: string | null = null;
    try {
      className = await this.classesService.findClassName(payment.classId);
    } catch {
      className = null;
    }

    await this.notificationsService.notify({
      userId: payment.userId,
      type: 'payment_confirmed',
      title: "You're All Set!",
      message: className
        ? `Payment confirmed — you're booked into "${className}"!`
        : `Payment confirmed — you're booked in!`,
      classId: payment.classId ?? undefined,
      paymentId: payment.id,
    });

    return {
      message: 'Payment verified successfully',
      payment: this.toApiShape(updatedPayment),
    };
  }

  /**
   * Handles a Paystack webhook. The HMAC-SHA512 signature is checked over the
   * exact bytes Paystack sent, then `charge.success` events are delegated to
   * verifyPayment.
   */
  async handlePaystackWebhook(signature: string, rawBody: Buffer | string) {
    // HMAC-SHA512 over the exact bytes Paystack sent (see main.ts rawBody).
    const expected = crypto
      .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY as string)
      .update(rawBody)
      .digest('hex');

    // timingSafeEqual throws on different lengths, so check length first.
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signature, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid signature');
    }

    const event = JSON.parse(rawBody.toString('utf8'));

    if (event.event === 'charge.success') {
      const { reference } = event.data;

      const payment = await this.paymentsRepo.findByReference(reference);
      if (!payment) return; // Unknown reference: nothing to do.
      if (payment.status === 'completed') return; // Already processed.

      try {
        // verifyPayment is shared with the redirect and the sweep, so every
        // trigger follows the same rules and re-checks the charge with
        // Paystack instead of trusting the webhook payload.
        await this.verifyPayment(reference);
      } catch (err) {
        // verifyPayment throws when Paystack reports a failed charge or the
        // re-check itself errors. In the failure case it has already
        // persisted `failed` and released the hold, so the error is only
        // logged and never allowed to escape the webhook handler.
        console.log(
          `Webhook verifyPayment could not complete for ${reference}:`,
          err,
        );
      }
    }
  }

  // Thin wrappers used by the maintenance jobs, so the queue layer never
  // touches the repository directly.

  // Pending payments older than `olderThanMinutes` (references only).
  async findStalePending(olderThanMinutes: number) {
    const before = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    return this.paymentsRepo.findStalePending(before);
  }

  // Force a still-pending payment to "failed" (hard-expiry safety net).
  // No-op if it already resolved. Returns whether a row changed.
  expireIfStillPending(reference: string) {
    return this.paymentsRepo.markPendingFailed(reference);
  }

  // Subscriptions still "active" whose endDate has passed (ids only).
  findExpiredSubscriptions() {
    return this.paymentsRepo.findExpiredActiveSubscriptions(new Date());
  }

  // Marks one subscription expired. No-op if it is no longer active.
  // Returns whether a row changed.
  expireSubscription(subscriptionId: string) {
    return this.paymentsRepo.markSubscriptionExpired(subscriptionId);
  }

  // Read endpoints. Prisma `include` replaces Mongoose `.populate`. The
  // class is deliberately not given a price field: Class has no top-level
  // `price` (only `pricing.*`).

  async getUserPayments(userId: string) {
    const payments = await this.paymentsRepo.findByUserId(userId);
    return payments.map((p) => this.toApiShape(p));
  }

  async getClassPayments(classId: string) {
    const payments = await this.paymentsRepo.findCompletedByClassId(classId);
    return payments.map((p) => this.toApiShape(p));
  }

  async getPaymentById(paymentId: string) {
    const payment = await this.paymentsRepo.findByIdWithRelations(paymentId);
    if (!payment) {
      throw new Error('Payment not found');
    }
    return this.toApiShape(payment);
  }

  async getAllPayments() {
    const payments = await this.paymentsRepo.findAllWithRelations();
    return payments.map((p) => this.toApiShape(p));
  }
}
