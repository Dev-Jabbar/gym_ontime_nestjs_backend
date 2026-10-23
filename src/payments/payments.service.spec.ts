import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import axios from "axios";
import { UnauthorizedException } from "@nestjs/common";
import { PaymentsService } from "./payments.service.js";
import type { PaymentsRepository } from "./payments.repository.js";
import type { UsersService } from "../users/users.service.js";
import type { MemberProfileService } from "../member-profile/member-profile.service.js";
import type { ClassesService } from "../classes/classes.service.js";
import type { NotificationsService } from "../notifications/notifications.service.js";

// Paystack is never called for real: axios is replaced by two spies.
vi.mock("axios", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
const http = axios as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

const SECRET = "sk_test_unit_test_secret";
const FUTURE = new Date("2099-01-01T09:00:00Z");
const PAST = new Date("2020-01-01T09:00:00Z");

// A pending one-time payment row, as the repository returns it.
const pendingPayment = (over: Record<string, unknown> = {}) => ({
  id: "pay-1",
  userId: "user-1",
  classId: "class-1",
  amount: "5000",
  status: "pending",
  paymentType: "one_time",
  subscriptionInterval: null,
  needsReview: false,
  paystackReference: "ref-1",
  ...over,
});

// Plain fakes, no Nest DI container (same convention as the other specs).
function build() {
  const repo = {
    findByReference: vi.fn(),
    updateByReference: vi.fn(async (_ref: string, patch: object) => ({
      ...pendingPayment(),
      ...patch,
    })),
    findCompletedPayment: vi.fn(async () => null),
    findActiveSubscription: vi.fn(async () => null),
    create: vi.fn(async () => ({})),
    createSubscription: vi.fn(async () => ({})),
  };
  const users = {
    findById: vi.fn(async () => ({
      id: "user-1",
      role: "member",
      email: "a@b.com",
      name: "Ada",
    })),
  };
  const members = {
    findActiveProfileByUserId: vi.fn(async () => ({ id: "mp-1" })),
  };
  const classes = {
    findClassById: vi.fn(async (_id?: string): Promise<any> => ({
      id: "class-1",
      name: "Boxing",
      recurrence: "none",
      schedule: FUTURE,
      pricing: { oneTime: 5000, weekly: 3000, monthly: 10000 },
    })),
    reserveSeat: vi.fn(async () => ({})),
    releaseSeat: vi.fn(async () => ({})),
    confirmSeat: vi.fn(),
    getClassEnrollmentStatus: vi.fn(),
    findClassName: vi.fn(async () => "Boxing"),
  };
  const notifications = { notify: vi.fn(async () => {}) };

  const svc = new PaymentsService(
    repo as unknown as PaymentsRepository,
    users as unknown as UsersService,
    members as unknown as MemberProfileService,
    classes as unknown as ClassesService,
    notifications as unknown as NotificationsService,
  );
  return { svc, repo, users, members, classes, notifications };
}

const paystackSuccess = () =>
  http.get.mockResolvedValue({
    data: { status: true, data: { status: "success", reference: "ref-1" } },
  });
const paystackAbandoned = () =>
  http.get.mockResolvedValue({
    data: { status: true, data: { status: "abandoned", reference: "ref-1" } },
  });

beforeEach(() => {
  process.env.PAYSTACK_SECRET_KEY = SECRET;
  process.env.FRONTEND_URL = "https://app.example.com";
  http.get.mockReset();
  http.post.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("PaymentsService.verifyPayment", () => {
  it("marks a failed charge as failed and releases the seat hold", async () => {
    const t = build();
    paystackAbandoned();
    t.repo.findByReference.mockResolvedValue(pendingPayment());

    await expect(t.svc.verifyPayment("ref-1")).rejects.toThrow(
      "Payment verification failed",
    );
    expect(t.repo.updateByReference).toHaveBeenCalledWith("ref-1", {
      status: "failed",
    });
    expect(t.classes.releaseSeat).toHaveBeenCalledWith("class-1", "mp-1");
    expect(t.classes.confirmSeat).not.toHaveBeenCalled();
  });

  it("does not touch a payment that is no longer pending when Paystack says failed", async () => {
    const t = build();
    paystackAbandoned();
    t.repo.findByReference.mockResolvedValue(
      pendingPayment({ status: "completed" }),
    );

    await expect(t.svc.verifyPayment("ref-1")).rejects.toThrow();
    expect(t.repo.updateByReference).not.toHaveBeenCalled();
    expect(t.classes.releaseSeat).not.toHaveBeenCalled();
  });

  it("is idempotent: an already completed payment is returned without side effects", async () => {
    const t = build();
    paystackSuccess();
    t.repo.findByReference.mockResolvedValue(
      pendingPayment({ status: "completed" }),
    );

    const r = await t.svc.verifyPayment("ref-1");
    expect(r.message).toBe("Payment already processed");
    expect(t.classes.confirmSeat).not.toHaveBeenCalled();
    expect(t.notifications.notify).not.toHaveBeenCalled();
  });

  it("throws when Paystack says success but we have no record of the reference", async () => {
    const t = build();
    paystackSuccess();
    t.repo.findByReference.mockResolvedValue(null);
    await expect(t.svc.verifyPayment("ref-1")).rejects.toThrow(
      "Payment record not found",
    );
  });

  it("enrolls the member, completes the payment and sends one confirmation", async () => {
    const t = build();
    paystackSuccess();
    t.repo.findByReference.mockResolvedValue(pendingPayment());
    t.classes.confirmSeat.mockResolvedValue({ id: "cm-1" });

    const r = await t.svc.verifyPayment("ref-1");

    expect(r.message).toBe("Payment verified successfully");
    expect(t.repo.updateByReference).toHaveBeenCalledWith("ref-1", {
      status: "completed",
    });
    expect(t.repo.createSubscription).not.toHaveBeenCalled();
    expect(t.notifications.notify).toHaveBeenCalledTimes(1);
    expect(t.notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        type: "payment_confirmed",
        title: "You're All Set!",
        classId: "class-1",
        paymentId: "pay-1",
      }),
    );
  });

  it("falls back to a generic message when the class name lookup fails", async () => {
    const t = build();
    paystackSuccess();
    t.repo.findByReference.mockResolvedValue(pendingPayment());
    t.classes.confirmSeat.mockResolvedValue({ id: "cm-1" });
    t.classes.findClassName.mockRejectedValue(new Error("db down"));

    await t.svc.verifyPayment("ref-1");
    expect(t.notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Payment confirmed — you're booked in!",
      }),
    );
  });

  it('treats "already enrolled" as success (a second path got there first)', async () => {
    const t = build();
    paystackSuccess();
    t.repo.findByReference.mockResolvedValue(pendingPayment());
    t.classes.confirmSeat.mockResolvedValue(null);
    t.classes.getClassEnrollmentStatus.mockResolvedValue("already-enrolled");

    const r = await t.svc.verifyPayment("ref-1");
    expect(r.message).toBe("Payment verified successfully");
    expect(t.repo.updateByReference).toHaveBeenCalledWith("ref-1", {
      status: "completed",
    });
  });

  it("creates an active weekly subscription ending 7 days later", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T10:00:00Z"));
    const t = build();
    paystackSuccess();
    t.repo.findByReference.mockResolvedValue(
      pendingPayment({
        paymentType: "subscription",
        subscriptionInterval: "weekly",
      }),
    );
    t.classes.confirmSeat.mockResolvedValue({ id: "cm-1" });

    await t.svc.verifyPayment("ref-1");

    expect(t.repo.createSubscription).toHaveBeenCalledTimes(1);
    const arg = (t.repo.createSubscription.mock.calls[0] as unknown[])[0] as {
      startDate: Date;
      endDate: Date;
      status: string;
      paymentId: string;
      interval: string;
    };
    expect(arg.status).toBe("active");
    expect(arg.paymentId).toBe("pay-1");
    expect(arg.interval).toBe("weekly");
    expect(arg.endDate.getTime() - arg.startDate.getTime()).toBe(
      7 * 24 * 60 * 60 * 1000,
    );
  });

  it("adds one calendar month for a monthly subscription", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T10:00:00Z"));
    const t = build();
    paystackSuccess();
    t.repo.findByReference.mockResolvedValue(
      pendingPayment({
        paymentType: "subscription",
        subscriptionInterval: "monthly",
      }),
    );
    t.classes.confirmSeat.mockResolvedValue({ id: "cm-1" });

    await t.svc.verifyPayment("ref-1");
    const arg = (t.repo.createSubscription.mock.calls[0] as unknown[])[0] as {
      endDate: Date;
    };
    expect(arg.endDate.getMonth()).toBe(10); // November (0-based)
    expect(arg.endDate.getDate()).toBe(15);
  });

  it.each(["hold-expired", "class-full"] as const)(
    "flags a charged payment for review (not completed) when the seat is gone: %s",
    async (reason) => {
      const t = build();
      paystackSuccess();
      t.repo.findByReference.mockResolvedValue(pendingPayment());
      t.classes.confirmSeat.mockResolvedValue(null);
      t.classes.getClassEnrollmentStatus.mockResolvedValue(reason);

      const r = await t.svc.verifyPayment("ref-1");

      expect(r.message).toBe("Payment received, pending manual review");
      expect(t.repo.updateByReference).toHaveBeenCalledWith("ref-1", {
        needsReview: true,
      });
      expect(t.repo.updateByReference).not.toHaveBeenCalledWith("ref-1", {
        status: "completed",
      });
      expect(t.repo.createSubscription).not.toHaveBeenCalled();
      expect(t.notifications.notify).toHaveBeenCalledWith(
        expect.objectContaining({ type: "payment_needs_review" }),
      );
    },
  );

  it("throws on an unexpected seat result and does not complete the payment", async () => {
    const t = build();
    paystackSuccess();
    t.repo.findByReference.mockResolvedValue(pendingPayment());
    t.classes.confirmSeat.mockResolvedValue(null);
    t.classes.getClassEnrollmentStatus.mockResolvedValue("unknown");

    await expect(t.svc.verifyPayment("ref-1")).rejects.toThrow(
      "Unexpected error claiming seat",
    );
    expect(t.repo.updateByReference).not.toHaveBeenCalled();
  });

  it('shapes the response for the frontend: numeric amount, "one-time", no _id alias', async () => {
    const t = build();
    paystackSuccess();
    t.repo.findByReference.mockResolvedValue(pendingPayment());
    t.classes.confirmSeat.mockResolvedValue({ id: "cm-1" });
    t.repo.updateByReference.mockResolvedValue(
      pendingPayment({ status: "completed", amount: "5000" }),
    );

    const r = await t.svc.verifyPayment("ref-1");
    expect(r.payment.amount).toBe(5000);
    expect(r.payment.paymentType).toBe("one-time");
    expect(r.payment).not.toHaveProperty("_id");
    expect(r.payment.id).toBe("pay-1");
  });
});

describe("PaymentsService.handlePaystackWebhook", () => {
  const sign = (body: string) =>
    crypto.createHmac("sha512", SECRET).update(body).digest("hex");
  const body = JSON.stringify({
    event: "charge.success",
    data: { reference: "ref-1" },
  });

  it("rejects a wrong signature with 401 and does nothing", async () => {
    const t = build();
    await expect(
      t.svc.handlePaystackWebhook("0".repeat(128), Buffer.from(body)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(t.repo.findByReference).not.toHaveBeenCalled();
  });

  it("rejects a signature of the wrong length without throwing a crypto error", async () => {
    const t = build();
    await expect(
      t.svc.handlePaystackWebhook("abc", Buffer.from(body)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects a valid signature of a DIFFERENT body (tampering)", async () => {
    const t = build();
    const tampered = body.replace("ref-1", "ref-2");
    await expect(
      t.svc.handlePaystackWebhook(sign(body), Buffer.from(tampered)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("verifies the payment when charge.success is correctly signed", async () => {
    const t = build();
    paystackSuccess();
    t.repo.findByReference.mockResolvedValue(pendingPayment());
    t.classes.confirmSeat.mockResolvedValue({ id: "cm-1" });

    await t.svc.handlePaystackWebhook(sign(body), Buffer.from(body));
    expect(http.get).toHaveBeenCalledTimes(1);
    expect(t.repo.updateByReference).toHaveBeenCalledWith("ref-1", {
      status: "completed",
    });
  });

  it("accepts the raw body as a string as well as a Buffer", async () => {
    const t = build();
    t.repo.findByReference.mockResolvedValue(null);
    await expect(
      t.svc.handlePaystackWebhook(sign(body), body),
    ).resolves.toBeUndefined();
  });

  it("ignores an unknown reference", async () => {
    const t = build();
    t.repo.findByReference.mockResolvedValue(null);
    await t.svc.handlePaystackWebhook(sign(body), Buffer.from(body));
    expect(http.get).not.toHaveBeenCalled();
  });

  it("skips a payment that is already completed (duplicate delivery)", async () => {
    const t = build();
    t.repo.findByReference.mockResolvedValue(
      pendingPayment({ status: "completed" }),
    );
    await t.svc.handlePaystackWebhook(sign(body), Buffer.from(body));
    expect(http.get).not.toHaveBeenCalled();
    expect(t.notifications.notify).not.toHaveBeenCalled();
  });

  it("ignores events other than charge.success", async () => {
    const t = build();
    const other = JSON.stringify({ event: "transfer.success", data: {} });
    await t.svc.handlePaystackWebhook(sign(other), Buffer.from(other));
    expect(t.repo.findByReference).not.toHaveBeenCalled();
  });

  it("does not throw when re-verification fails (webhook still answers)", async () => {
    const t = build();
    vi.spyOn(console, "log").mockImplementation(() => {});
    t.repo.findByReference.mockResolvedValue(pendingPayment());
    http.get.mockRejectedValue(new Error("paystack unreachable"));

    await expect(
      t.svc.handlePaystackWebhook(sign(body), Buffer.from(body)),
    ).resolves.toBeUndefined();
  });
});

describe("PaymentsService.createCheckoutSession", () => {
  const input = {
    userId: "user-1",
    classId: "class-1",
    paymentType: "one-time" as const,
  };

  const paystackInit = () =>
    http.post.mockResolvedValue({
      data: {
        status: true,
        data: {
          authorization_url: "https://checkout.paystack.com/abc",
          access_code: "acc",
          reference: "ref-9",
        },
      },
    });

  it("holds a seat for 15 minutes, charges price x 100 kobo and stores a pending payment", async () => {
    const t = build();
    paystackInit();

    const r = await t.svc.createCheckoutSession(input);

    expect(r).toEqual({
      checkoutUrl: "https://checkout.paystack.com/abc",
      reference: "ref-9",
    });
    expect(t.classes.reserveSeat).toHaveBeenCalledWith("class-1", "mp-1", 15);

    const [url, payload] = http.post.mock.calls[0] as [
      string,
      { amount: number; currency: string; callback_url: string },
    ];
    expect(url).toContain("/transaction/initialize");
    expect(payload.amount).toBe(500000);
    expect(payload.currency).toBe("NGN");
    expect(payload.callback_url).toBe(
      "https://app.example.com/payment-success",
    );

    expect(t.repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "pending",
        paymentType: "one_time", // DB enum spelling, not the API's "one-time"
        paystackReference: "ref-9",
        amount: 5000,
      }),
    );
  });

  it("uses the subscription price for the chosen interval", async () => {
    const t = build();
    paystackInit();
    t.classes.findClassById.mockResolvedValue({
      id: "class-1",
      name: "Yoga",
      recurrence: "weekly",
      schedule: FUTURE,
      pricing: { oneTime: 5000, weekly: 3000 },
    });

    await t.svc.createCheckoutSession({
      ...input,
      paymentType: "subscription",
      subscriptionInterval: "weekly",
    });
    const payload = (http.post.mock.calls[0] as unknown[])[1] as {
      amount: number;
    };
    expect(payload.amount).toBe(300000);
    expect(t.repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentType: "subscription",
        subscriptionInterval: "weekly",
      }),
    );
  });

  it("refuses a one-off class that has already started, before touching any seat", async () => {
    const t = build();
    t.classes.findClassById.mockResolvedValue({
      id: "class-1",
      name: "Old",
      recurrence: "none",
      schedule: PAST,
      pricing: { oneTime: 5000 },
    });
    await expect(t.svc.createCheckoutSession(input)).rejects.toThrow(
      "This class has already started or ended and can no longer be booked.",
    );
    expect(t.classes.reserveSeat).not.toHaveBeenCalled();
    expect(http.post).not.toHaveBeenCalled();
  });

  it("still allows a recurring class whose first date is long past", async () => {
    const t = build();
    paystackInit();
    t.classes.findClassById.mockResolvedValue({
      id: "class-1",
      name: "Yoga",
      recurrence: "weekly",
      schedule: PAST,
      pricing: { oneTime: 5000 },
    });
    await expect(t.svc.createCheckoutSession(input)).resolves.toBeDefined();
  });

  it("refuses a subscription on a one-off class", async () => {
    const t = build();
    await expect(
      t.svc.createCheckoutSession({
        ...input,
        paymentType: "subscription",
        subscriptionInterval: "weekly",
      }),
    ).rejects.toThrow("Subscriptions are not available for one-off classes");
  });

  it("requires an interval for a subscription and rejects an unknown one", async () => {
    const t = build();
    await expect(
      t.svc.createCheckoutSession({ ...input, paymentType: "subscription" }),
    ).rejects.toThrow("Subscription interval is required");
    await expect(
      t.svc.createCheckoutSession({
        ...input,
        paymentType: "subscription",
        subscriptionInterval: "yearly" as never,
      }),
    ).rejects.toThrow("Invalid subscription interval");
  });

  it("refuses a class that does not offer the chosen price", async () => {
    const t = build();
    t.classes.findClassById.mockResolvedValue({
      id: "class-1",
      name: "Yoga",
      recurrence: "weekly",
      schedule: FUTURE,
      pricing: { oneTime: 5000 }, // no monthly price
    });
    await expect(
      t.svc.createCheckoutSession({
        ...input,
        paymentType: "subscription",
        subscriptionInterval: "monthly",
      }),
    ).rejects.toThrow("does not support monthly subscriptions");
  });

  it("only lets members pay", async () => {
    const t = build();
    t.users.findById.mockResolvedValue({
      id: "user-1",
      role: "trainer",
      email: "a@b.com",
      name: "T",
    });
    await expect(t.svc.createCheckoutSession(input)).rejects.toThrow(
      "Only members can enroll in paid classes",
    );
  });

  it("refuses a member who already paid, and does not hold a seat", async () => {
    const t = build();
    t.repo.findCompletedPayment.mockResolvedValue({ id: "old" } as never);
    await expect(t.svc.createCheckoutSession(input)).rejects.toThrow(
      "You are already enrolled in this class",
    );
    expect(t.classes.reserveSeat).not.toHaveBeenCalled();
  });

  it("refuses a second active subscription", async () => {
    const t = build();
    t.classes.findClassById.mockResolvedValue({
      id: "class-1",
      name: "Yoga",
      recurrence: "weekly",
      schedule: FUTURE,
      pricing: { weekly: 3000 },
    });
    t.repo.findActiveSubscription.mockResolvedValue({ id: "sub" } as never);
    await expect(
      t.svc.createCheckoutSession({
        ...input,
        paymentType: "subscription",
        subscriptionInterval: "weekly",
      }),
    ).rejects.toThrow("You already have an active subscription");
  });

  it("releases the seat hold when Paystack initialisation fails", async () => {
    const t = build();
    http.post.mockRejectedValue(
      new Error("Request failed with status code 401"),
    );

    await expect(t.svc.createCheckoutSession(input)).rejects.toThrow(
      "status code 401",
    );
    expect(t.classes.releaseSeat).toHaveBeenCalledWith("class-1", "mp-1");
    expect(t.repo.create).not.toHaveBeenCalled();
  });

  it("releases the hold and reports the reference when saving the payment fails", async () => {
    const t = build();
    paystackInit();
    t.repo.create.mockRejectedValue(new Error("db down"));

    await expect(t.svc.createCheckoutSession(input)).rejects.toThrow(
      /Failed to save payment record.*ref-9/,
    );
    expect(t.classes.releaseSeat).toHaveBeenCalledWith("class-1", "mp-1");
  });

  it("needs PAYSTACK_SECRET_KEY and FRONTEND_URL", async () => {
    const t = build();
    delete process.env.PAYSTACK_SECRET_KEY;
    await expect(t.svc.createCheckoutSession(input)).rejects.toThrow(
      "Paystack secret key is not configured",
    );
    process.env.PAYSTACK_SECRET_KEY = SECRET;
    delete process.env.FRONTEND_URL;
    await expect(t.svc.createCheckoutSession(input)).rejects.toThrow(
      "FRONTEND_URL is not configured",
    );
  });
});
