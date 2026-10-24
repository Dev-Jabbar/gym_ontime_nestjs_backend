import { describe, it, expect, vi } from "vitest";
import { NotificationsService } from "./notifications.service.js";
import type { NotificationsRepository } from "./notifications.repository.js";
import type { DeviceTokensRepository } from "./device-tokens.repository.js";
import type { PushService } from "./push.service.js";

// Plain fakes, no Nest DI container (same convention as the other specs).
function build(adminIds: string[] = ["admin-1", "admin-2"]) {
  const repo = {
    findActiveAdminIds: vi.fn(async () => adminIds),
    create: vi.fn(async (data: object) => ({ id: "n-1", ...data })),
  };
  const push = { sendToUser: vi.fn(async () => {}) };
  const svc = new NotificationsService(
    repo as unknown as NotificationsRepository,
    {} as unknown as DeviceTokensRepository,
    push as unknown as PushService,
  );
  return { svc, repo, push };
}

const alert = {
  type: "payment_needs_review" as const,
  title: "Payment Needs Review",
  message: "Ada paid but the seat could not be confirmed.",
  classId: "class-1",
  paymentId: "pay-1",
};

describe("NotificationsService.notifyAdmins", () => {
  it("creates one notification and one push per admin", async () => {
    const t = build();

    await t.svc.notifyAdmins(alert);

    expect(t.repo.create).toHaveBeenCalledTimes(2);
    expect(t.repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "admin-1",
        type: "payment_needs_review",
        relatedClassId: "class-1",
        relatedPaymentId: "pay-1",
      }),
    );
    expect(t.repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "admin-2" }),
    );
    expect(t.push.sendToUser).toHaveBeenCalledTimes(2);
  });

  it("does nothing when there are no active admins", async () => {
    const t = build([]);

    await t.svc.notifyAdmins(alert);

    expect(t.repo.create).not.toHaveBeenCalled();
    expect(t.push.sendToUser).not.toHaveBeenCalled();
  });

  it("never throws when the admin lookup fails", async () => {
    const t = build();
    t.repo.findActiveAdminIds.mockRejectedValue(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(t.svc.notifyAdmins(alert)).resolves.toBeUndefined();
    expect(t.repo.create).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  it("one admin failing to save does not stop the others", async () => {
    const t = build();
    t.repo.create.mockRejectedValueOnce(new Error("write failed"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(t.svc.notifyAdmins(alert)).resolves.toBeUndefined();

    expect(t.repo.create).toHaveBeenCalledTimes(2);
    expect(t.push.sendToUser).toHaveBeenCalledTimes(1); // only the one saved

    spy.mockRestore();
  });
});
