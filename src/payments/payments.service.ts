import { Injectable, UnauthorizedException } from '@nestjs/common';
import axios from 'axios';
import crypto from 'crypto';
import { PaymentsRepository } from './payments.repository.js';
import { UsersService } from '../users/users.service.js';
import { MemberProfileService } from '../member-profile/member-profile.service.js';
import { ClassesService } from '../classes/classes.service.js';
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

// Prisma's PaymentType enum uses an underscore (one_time) — Postgres
// enum identifiers can't contain a hyphen. Every other value in this
// module (status, provider, subscription interval) happens to already
// match its wire-format string exactly, so this is the one field that
// needs explicit two-way mapping between the DB and the API shape the
// frontend actually expects (checked against real frontend code:
// features/payments/types/index.ts's PaymentType is "one-time", with a
// hyphen).
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

  // Shapes a raw Prisma Payment row for the API response: adds an `_id`
  // alias of `id` on the payment itself AND on any populated `user`/
  // `class` sub-object, and maps the DB's `one_time` enum value back to
  // the wire format's `one-time`.
  //
  // The nested aliasing specifically is NOT a cosmetic nicety — a full
  // sweep of the real frontend found `useBookedClasses.ts` reads
  // `payment.class._id` directly to build the set of class IDs a
  // member has already paid for, which drives the "Book Now" vs
  // "Booked" state on the schedule page. Missing that alias wouldn't
  // throw or warn anywhere; every already-booked class would just
  // silently show "Book Now" again, because the built Set would fill
  // with `undefined` instead of real class IDs. (An earlier, narrower
  // check of only the payments/subscriptions feature folders had
  // concluded nested `_id` was never read — that conclusion was wrong;
  // this hook lives in features/schedule and was missed until a full
  // codebase grep for `._id` usage caught it.)
  private toApiShape(payment: any) {
    return {
      ...payment,
      _id: payment.id,
      amount: Number(payment.amount),
      paymentType: toApiPaymentType(payment.paymentType),
      ...(payment.user && { user: { ...payment.user, _id: payment.user.id } }),
      ...(payment.class && {
        class: { ...payment.class, _id: payment.class.id },
      }),
    };
  }

  // ────────────────────────────────────────────────────────────────
  // INITIATE PAYMENT
  // Direct port of createCheckoutSession. Same order of checks as
  // Express, same seat-hold-before-Paystack-call sequencing, same
  // release-the-hold-on-failure behavior at both points where Express
  // does it (Paystack init failure, and payment-record save failure).
  // ────────────────────────────────────────────────────────────────
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

    // findClassById already throws NotFoundException('Class not found')
    // itself if missing — same message Express's manual check produces,
    // just via a thrown HttpException instead of a plain Error. Both
    // carry .message, so the controller's catch handles either the same
    // way; letting it propagate here avoids a redundant duplicate check.
    const classItem = await this.classesService.findClassById(classId);

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

    // Atomically claim a seat and hold it under this member's profile
    // for SEAT_HOLD_MINUTES. May throw NotFoundException('Class not
    // found') or ConflictException with a specific reason (already
    // enrolled, active hold, class full) — see classes.service.ts. Left
    // to propagate directly rather than caught-and-rethrown, since the
    // controller's catch extracts .message the same way regardless of
    // whether it's a plain Error or an HttpException.
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
      // Paystack init failed — don't leave this seat locked for 15
      // minutes over a checkout that never actually started.
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
      // Paystack already has a live session, but we failed to save our
      // own record of it — release the hold rather than lock the seat
      // for 15 minutes with no record verifyPayment could ever find.
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

  // ────────────────────────────────────────────────────────────────
  // CLAIM SEAT — internal only, called from verifyPayment(). Direct
  // port of claimSeat(), same reason set.
  // ────────────────────────────────────────────────────────────────
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

  // ────────────────────────────────────────────────────────────────
  // VERIFY PAYMENT
  // Direct port of verifyPayment() — the single source of truth for
  // "did this payment actually happen," called by both the webhook
  // and the frontend's own /payment-success page. Same
  // re-verify-against-Paystack-never-trust-the-caller behavior, same
  // idempotency on an already-completed payment, same needsReview
  // branch for a charged-but-seat-lost payment.
  // ────────────────────────────────────────────────────────────────
  async verifyPayment(reference: string) {
    const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY as string;

    const { data } = await axios.get<PaystackVerifyResponse>(
      `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
      { headers: { Authorization: `Bearer ${paystackSecretKey}` } },
    );

    // Paystack does not send a webhook event for a failed/declined
    // charge — per their docs, webhooks only fire for a successful
    // charge. This verify() call is the ONLY place in the flow that
    // ever finds out about a failure, so it persists "failed" and
    // releases the seat hold right away rather than leaving the record
    // stuck at "pending" forever.
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

    // Claim the seat before marking anything complete, so a
    // "completed" payment can never exist without a genuinely secured
    // seat behind it.
    const seatResult = await this.claimSeat(payment.classId, memberProfile.id);

    if (seatResult === 'hold-expired' || seatResult === 'class-full') {
      // Money was charged but the seat is no longer available. Flag
      // for manual review instead of guessing whether to refund or
      // bump someone — that's a business decision, not a code
      // decision.
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

      // Deliberate improvement over Express, flagged not silent:
      // Express returns the payment object it fetched BEFORE setting
      // needsReview, so its API response's needsReview field is stale
      // (still false) even though the DB row is now true. Returning
      // the freshly updated row here is strictly more correct and
      // nothing in the frontend inspects this field for the
      // needs-review case (only `message` is read), so there's no
      // compatibility reason to keep the stale value.
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

    // "enrolled" or "already-enrolled" — safe to continue.
    if (payment.paymentType === 'subscription' && payment.subscriptionInterval) {
      const startDate = new Date();
      const endDate = calculateEndDate(
        startDate,
        payment.subscriptionInterval as ApiSubscriptionInterval,
      );

      // Payment has no subscriptionId field to set — per the schema,
      // the FK lives on ClassSubscription.paymentId, and
      // Payment.subscription is a back-relation only (same direction
      // as Mongoose's subscription.payment being the required side).
      // Creating the row below is what establishes the link; there's
      // nothing further to write onto the Payment record itself.
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

    // Fetch the class name for a friendlier message — falls back to a
    // generic one if the lookup fails, since a notification isn't
    // worth failing the whole verification over.
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

  // ────────────────────────────────────────────────────────────────
  // PAYSTACK WEBHOOK
  // Direct port of payment.webhook.ts's handlePaystackWebhook.
  // ────────────────────────────────────────────────────────────────
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
      if (!payment) return; // unknown reference, nothing to do
      if (payment.status === 'completed') return; // already processed elsewhere

      try {
        // Delegates entirely to verifyPayment() — the same function
        // the user's own /payment-success redirect and the scheduled
        // cleanup sweep (Step 5) both use. Single source of truth,
        // not a second implementation that can drift out of sync.
        await this.verifyPayment(reference);
      } catch (err) {
        // verifyPayment throws when Paystack reports the charge
        // failed or the re-verification request itself errors — but
        // it already persists "failed" and releases the seat hold
        // before throwing in the failure case, so this catch just
        // stops an uncaught rejection from bubbling out of the
        // webhook handler.
        console.log(
          `Webhook verifyPayment could not complete for ${reference}:`,
          err,
        );
      }
    }
  }

  // ────────────────────────────────────────────────────────────────
  // QUEUE SUPPORT — used by the Step 5 maintenance sweep. Thin wrappers
  // so the queue never touches the repository directly.
  // ────────────────────────────────────────────────────────────────

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

  // ────────────────────────────────────────────────────────────────
  // READ ENDPOINTS — direct ports of payment.repository.ts's find*
  // functions, using Prisma `include` in place of Mongoose `.populate`.
  // Note: Express's findAllPayments/findPaymentById populate
  // ("class", "name price") — but Class has no top-level `price`
  // field (only nested pricing.*), so that populate silently returns
  // no price in Express today. Matched here by simply not selecting
  // any price-like field on class — same end result, not a fix.
  // ────────────────────────────────────────────────────────────────

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
