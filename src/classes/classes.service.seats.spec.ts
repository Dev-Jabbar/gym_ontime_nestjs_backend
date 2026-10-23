import { describe, it, expect, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ClassesService } from './classes.service.js';
import type { ClassesRepository } from './classes.repository.js';

// Seat-hold rules. The atomic row lock itself lives in the repository (SQL)
// and needs a real Postgres; here we check the business rules around it.
function build() {
  const repo = {
    reserveSeat: vi.fn(),
    deleteHold: vi.fn(async () => ({ count: 1 })),
    confirmHold: vi.fn(),
    deleteExpiredHolds: vi.fn(async () => ({ count: 3 })),
    getEnrollmentSnapshot: vi.fn(),
  };
  const svc = new ClassesService(repo as unknown as ClassesRepository);
  return { svc, repo };
}

const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000);

describe('ClassesService.reserveSeat', () => {
  it('returns the hold when the seat was reserved', async () => {
    const { svc, repo } = build();
    repo.reserveSeat.mockResolvedValue({
      status: 'reserved',
      hold: { id: 'hold-1' },
    });
    await expect(svc.reserveSeat('c1', 'mp1', 15)).resolves.toEqual({
      id: 'hold-1',
    });
    expect(repo.reserveSeat).toHaveBeenCalledWith('c1', 'mp1', 15);
  });

  it('maps class-not-found to a 404', async () => {
    const { svc, repo } = build();
    repo.reserveSeat.mockResolvedValue({ status: 'class-not-found' });
    await expect(svc.reserveSeat('c1', 'mp1', 15)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it.each([
    ['already-enrolled', 'Already enrolled in this class'],
    ['active-hold', 'You already have an active hold on this class'],
    ['class-full', 'Class is full'],
  ])('maps %s to a 409 with its own message', async (status, message) => {
    const { svc, repo } = build();
    repo.reserveSeat.mockResolvedValue({ status });
    const err = await svc.reserveSeat('c1', 'mp1', 15).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as Error).message).toBe(message);
  });
});

describe('ClassesService seat helpers', () => {
  it('releaseSeat deletes that member\'s hold', async () => {
    const { svc, repo } = build();
    await svc.releaseSeat('c1', 'mp1');
    expect(repo.deleteHold).toHaveBeenCalledWith('c1', 'mp1');
  });

  it('confirmSeat returns null (not an exception) when there is no valid hold', async () => {
    const { svc, repo } = build();
    repo.confirmHold.mockResolvedValue(null);
    await expect(svc.confirmSeat('c1', 'mp1')).resolves.toBeNull();
  });

  it('releaseExpiredHolds reports how many holds were removed', async () => {
    const { svc } = build();
    await expect(svc.releaseExpiredHolds()).resolves.toEqual({ count: 3 });
  });
});

describe('ClassesService.getClassEnrollmentStatus', () => {
  const snap = (over: Record<string, unknown> = {}) => ({
    isMember: false,
    mostRecentHold: null,
    capacity: 10,
    memberCount: 2,
    ...over,
  });

  it('class-not-found when the class is gone', async () => {
    const { svc, repo } = build();
    repo.getEnrollmentSnapshot.mockResolvedValue(null);
    await expect(svc.getClassEnrollmentStatus('c1', 'mp1')).resolves.toBe(
      'class-not-found',
    );
  });

  it('already-enrolled wins over everything else', async () => {
    const { svc, repo } = build();
    repo.getEnrollmentSnapshot.mockResolvedValue(
      snap({ isMember: true, memberCount: 10 }),
    );
    await expect(svc.getClassEnrollmentStatus('c1', 'mp1')).resolves.toBe(
      'already-enrolled',
    );
  });

  it('hold-expired when the only hold is in the past', async () => {
    const { svc, repo } = build();
    repo.getEnrollmentSnapshot.mockResolvedValue(
      snap({ mostRecentHold: { expiresAt: minutesFromNow(-1) } }),
    );
    await expect(svc.getClassEnrollmentStatus('c1', 'mp1')).resolves.toBe(
      'hold-expired',
    );
  });

  it('an unexpired hold does not short-circuit: a full class still reports class-full (Express parity)', async () => {
    const { svc, repo } = build();
    repo.getEnrollmentSnapshot.mockResolvedValue(
      snap({
        mostRecentHold: { expiresAt: minutesFromNow(5) },
        memberCount: 10,
      }),
    );
    await expect(svc.getClassEnrollmentStatus('c1', 'mp1')).resolves.toBe(
      'class-full',
    );
  });

  it('class-full when there is no hold and capacity is reached', async () => {
    const { svc, repo } = build();
    repo.getEnrollmentSnapshot.mockResolvedValue(snap({ memberCount: 10 }));
    await expect(svc.getClassEnrollmentStatus('c1', 'mp1')).resolves.toBe(
      'class-full',
    );
  });

  it('unknown when there is room, and when capacity is unlimited (null)', async () => {
    const { svc, repo } = build();
    repo.getEnrollmentSnapshot.mockResolvedValue(snap());
    await expect(svc.getClassEnrollmentStatus('c1', 'mp1')).resolves.toBe(
      'unknown',
    );
    repo.getEnrollmentSnapshot.mockResolvedValue(
      snap({ capacity: null, memberCount: 999 }),
    );
    await expect(svc.getClassEnrollmentStatus('c1', 'mp1')).resolves.toBe(
      'unknown',
    );
  });
});
