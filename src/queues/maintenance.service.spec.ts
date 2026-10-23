import { describe, it, expect, vi, beforeEach } from "vitest";
import { Logger } from "@nestjs/common";
import { MaintenanceService } from "./maintenance.service.js";
import type { PaymentsService } from "../payments/payments.service.js";
import type { ClassesService } from "../classes/classes.service.js";
import type { NotificationsService } from "../notifications/notifications.service.js";

// Keep the test output clean: the service logs every run.
beforeEach(() => {
  vi.spyOn(Logger.prototype, "log").mockImplementation(() => {});
  vi.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
});

const HOUR = 60 * 60 * 1000;

function build() {
  const payments = {
    findStalePending: vi.fn(async () => [] as unknown[]),
    verifyPayment: vi.fn(async (_reference: string): Promise<unknown> => ({})),
    expireIfStillPending: vi.fn(async (_reference: string) => true),
    findExpiredSubscriptions: vi.fn(async () => [] as unknown[]),
    expireSubscription: vi.fn(async (_id: string) => true),
  };
  const classes = {
    releaseExpiredHolds: vi.fn(async () => ({ count: 0 })),
    removeMemberByProfileId: vi.fn(
      async (_classId: string, _memberProfileId: string) => true,
    ),
    findClassesForReminders: vi.fn(async () => [] as unknown[]),
    markReminderSent: vi.fn(
      async (_id: string, _at: Date): Promise<unknown> => ({}),
    ),
  };
  const notifications = { notify: vi.fn(async () => {}) };
  const svc = new MaintenanceService(
    payments as unknown as PaymentsService,
    classes as unknown as ClassesService,
    notifications as unknown as NotificationsService,
  );
  return { svc, payments, classes, notifications };
}

const stale = (reference: string, ageHours = 1) => ({
  paystackReference: reference,
  createdAt: new Date(Date.now() - ageHours * HOUR),
});

describe("MaintenanceService.runSweep", () => {
  it("resolves stale payments through verifyPayment and releases expired holds", async () => {
    const t = build();
    t.payments.findStalePending.mockResolvedValue([stale("a"), stale("b")]);
    t.classes.releaseExpiredHolds.mockResolvedValue({ count: 4 });

    const r = await t.svc.runSweep();

    expect(t.payments.verifyPayment).toHaveBeenCalledWith("a");
    expect(t.payments.verifyPayment).toHaveBeenCalledWith("b");
    expect(r).toEqual({
      checked: 2,
      resolved: 2,
      unresolved: 0,
      hardExpired: 0,
      holdsReleased: 4,
    });
  });

  it("one failing reference does not stop the rest of the batch", async () => {
    const t = build();
    t.payments.findStalePending.mockResolvedValue([
      stale("bad"),
      stale("good"),
    ]);
    t.payments.verifyPayment.mockImplementation(async (ref: string) => {
      if (ref === "bad") throw new Error("paystack down");
      return {};
    });

    const r = await t.svc.runSweep();
    expect(r.resolved).toBe(1);
    expect(r.unresolved).toBe(1);
    expect(r.hardExpired).toBe(0); // young payment: try again next pass
    expect(t.payments.expireIfStillPending).not.toHaveBeenCalled();
  });

  it("force-expires an unresolved payment older than 24 hours, never a younger one", async () => {
    const t = build();
    t.payments.findStalePending.mockResolvedValue([
      stale("old", 25),
      stale("young", 2),
    ]);
    t.payments.verifyPayment.mockRejectedValue(new Error("not successful"));

    const r = await t.svc.runSweep();
    expect(t.payments.expireIfStillPending).toHaveBeenCalledTimes(1);
    expect(t.payments.expireIfStillPending).toHaveBeenCalledWith("old");
    expect(r.hardExpired).toBe(1);
    expect(r.unresolved).toBe(2);
  });

  it("does not count a hard expiry that changed nothing", async () => {
    const t = build();
    t.payments.findStalePending.mockResolvedValue([stale("old", 30)]);
    t.payments.verifyPayment.mockRejectedValue(new Error("x"));
    t.payments.expireIfStillPending.mockResolvedValue(false);
    expect((await t.svc.runSweep()).hardExpired).toBe(0);
  });

  it("still releases holds when there is nothing stale", async () => {
    const t = build();
    await t.svc.runSweep();
    expect(t.classes.releaseExpiredHolds).toHaveBeenCalledTimes(1);
  });
});

describe("MaintenanceService.runSubscriptionExpiry", () => {
  const sub = (id: string) => ({
    id,
    classId: `class-${id}`,
    memberProfileId: `mp-${id}`,
  });

  it("removes the member first, then marks the subscription expired", async () => {
    const t = build();
    t.payments.findExpiredSubscriptions.mockResolvedValue([sub("1")]);
    const order: string[] = [];
    t.classes.removeMemberByProfileId.mockImplementation(async () => {
      order.push("remove");
      return true;
    });
    t.payments.expireSubscription.mockImplementation(async () => {
      order.push("expire");
      return true;
    });

    const r = await t.svc.runSubscriptionExpiry();
    expect(order).toEqual(["remove", "expire"]);
    expect(t.classes.removeMemberByProfileId).toHaveBeenCalledWith(
      "class-1",
      "mp-1",
    );
    expect(r).toEqual({ checked: 1, expired: 1, membersRemoved: 1, failed: 0 });
  });

  it("leaves the subscription active (retried next run) when removing the member fails", async () => {
    const t = build();
    t.payments.findExpiredSubscriptions.mockResolvedValue([sub("1"), sub("2")]);
    t.classes.removeMemberByProfileId.mockImplementation(
      async (classId: string) => {
        if (classId === "class-1") throw new Error("db blip");
        return true;
      },
    );

    const r = await t.svc.runSubscriptionExpiry();
    expect(t.payments.expireSubscription).toHaveBeenCalledTimes(1);
    expect(t.payments.expireSubscription).toHaveBeenCalledWith("2");
    expect(r).toEqual({ checked: 2, expired: 1, membersRemoved: 1, failed: 1 });
  });

  it("still expires the subscription when the member was already gone", async () => {
    const t = build();
    t.payments.findExpiredSubscriptions.mockResolvedValue([sub("1")]);
    t.classes.removeMemberByProfileId.mockResolvedValue(false);
    const r = await t.svc.runSubscriptionExpiry();
    expect(r).toEqual({ checked: 1, expired: 1, membersRemoved: 0, failed: 0 });
  });

  it("does nothing when no subscription is due", async () => {
    const t = build();
    const r = await t.svc.runSubscriptionExpiry();
    expect(r).toEqual({ checked: 0, expired: 0, membersRemoved: 0, failed: 0 });
  });
});

describe("MaintenanceService.runClassReminders", () => {
  // Wednesday 2026-10-14, 10:00 Lagos (= 09:00 UTC).
  const now = new Date("2026-10-14T09:00:00Z");
  const member = (userId: string) => ({ memberProfile: { userId } });

  // A one-off class starting `minutes` after `now`.
  const oneOff = (id: string, minutes: number, over: object = {}) => ({
    id,
    name: `Class ${id}`,
    schedule: new Date(now.getTime() + minutes * 60_000),
    recurrence: "none",
    recurrenceDays: [] as string[],
    lastReminderSentAt: null as Date | null,
    members: [member("u1"), member("u2")],
    ...over,
  });

  it("notifies every enrolled member once and marks the class reminded", async () => {
    const t = build();
    t.classes.findClassesForReminders.mockResolvedValue([oneOff("c1", 30)]);

    const r = await t.svc.runClassReminders(now);

    expect(t.notifications.notify).toHaveBeenCalledTimes(2);
    expect(t.notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        type: "class_reminder",
        title: "Class Starting Soon",
        classId: "c1",
        message: '"Class c1" starts in about 30 minute(s).',
      }),
    );
    expect(t.classes.markReminderSent).toHaveBeenCalledWith("c1", now);
    expect(r).toEqual({
      checked: 1,
      classesReminded: 1,
      notified: 2,
      failed: 0,
    });
  });

  it('says "about an hour" when the class is 45+ minutes away', async () => {
    const t = build();
    t.classes.findClassesForReminders.mockResolvedValue([oneOff("c1", 55)]);
    await t.svc.runClassReminders(now);
    expect(t.notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '"Class c1" starts in about an hour.',
      }),
    );
  });

  it("skips classes outside the 60 minute window and classes already started", async () => {
    const t = build();
    t.classes.findClassesForReminders.mockResolvedValue([
      oneOff("far", 120),
      oneOff("started", -5),
    ]);
    const r = await t.svc.runClassReminders(now);
    expect(t.notifications.notify).not.toHaveBeenCalled();
    expect(r.classesReminded).toBe(0);
    expect(r.checked).toBe(2);
  });

  it("does not remind twice on the same Lagos day", async () => {
    const t = build();
    t.classes.findClassesForReminders.mockResolvedValue([
      oneOff("c1", 30, {
        lastReminderSentAt: new Date("2026-10-14T08:30:00Z"),
      }),
    ]);
    await t.svc.runClassReminders(now);
    expect(t.notifications.notify).not.toHaveBeenCalled();
  });

  it("reminds again the next day (a recurring class)", async () => {
    const t = build();
    // Daily class whose time of day is 10:30 Lagos; last reminded yesterday.
    t.classes.findClassesForReminders.mockResolvedValue([
      {
        id: "daily",
        name: "Daily",
        schedule: new Date("2026-09-01T09:30:00Z"),
        recurrence: "daily",
        recurrenceDays: [],
        lastReminderSentAt: new Date("2026-10-13T08:30:00Z"),
        members: [member("u1")],
      },
    ]);
    const r = await t.svc.runClassReminders(now);
    expect(r.classesReminded).toBe(1);
  });

  it("reminds a weekly class only on its weekday", async () => {
    const t = build();
    const weekly = (days: string[]) => ({
      id: "w",
      name: "Weekly",
      schedule: new Date("2026-09-01T09:30:00Z"),
      recurrence: "weekly",
      recurrenceDays: days,
      lastReminderSentAt: null,
      members: [member("u1")],
    });
    t.classes.findClassesForReminders.mockResolvedValue([weekly(["monday"])]);
    expect((await t.svc.runClassReminders(now)).classesReminded).toBe(0); // today is Wednesday
    t.classes.findClassesForReminders.mockResolvedValue([
      weekly(["wednesday"]),
    ]);
    expect((await t.svc.runClassReminders(now)).classesReminded).toBe(1);
  });

  it("does not mark a class with no members as reminded", async () => {
    const t = build();
    t.classes.findClassesForReminders.mockResolvedValue([
      oneOff("c1", 30, { members: [] }),
    ]);
    await t.svc.runClassReminders(now);
    expect(t.classes.markReminderSent).not.toHaveBeenCalled();
  });

  it("one failing class does not stop the others, and is not marked reminded", async () => {
    const t = build();
    t.classes.findClassesForReminders.mockResolvedValue([
      oneOff("bad", 30),
      oneOff("good", 30),
    ]);
    t.classes.markReminderSent.mockImplementation(async (id: string) => {
      if (id === "bad") throw new Error("db blip");
      return {};
    });

    const r = await t.svc.runClassReminders(now);
    expect(r.failed).toBe(1);
    expect(r.classesReminded).toBe(1);
  });
});
