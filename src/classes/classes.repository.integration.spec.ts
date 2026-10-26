import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { ClassesRepository } from './classes.repository.js';

// Integration test: runs against a real Postgres, not a fake.
//
// Why it exists: the seat claim in ClassesRepository.reserveSeat relies on
// `SELECT ... FOR UPDATE`, which is SQL behaviour inside Postgres. A fake
// database cannot prove that it stops two people taking the last seat. These
// tests fire many bookings at the same moment and count the winners.
//
// It only runs when TEST_DATABASE_URL is set (CI sets it, see
// .github/workflows/integration.yml). Without it the whole file is skipped,
// so a plain `npm test` needs no database.
//
// Safety: it refuses to run against anything but a local database, so it can
// never touch a hosted database such as Neon by mistake.

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1', 'postgres'];

function assertLocalDatabase(url: string) {
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.includes(host)) {
    throw new Error(
      `Refusing to run integration tests against "${host}". ` +
        `TEST_DATABASE_URL must point at a local or CI database.`,
    );
  }
}

// reserveSeat() and confirmHold() only use the cache and the event bus to
// announce changes after a commit; simple stand-ins are enough here.
const fakeCache = { invalidateClasses: async () => undefined };
const fakeEvents = { classChanged: () => undefined };

describe.skipIf(!TEST_DB_URL)('ClassesRepository seat claim (real Postgres)', () => {
  let prisma: PrismaService;
  let repo: ClassesRepository;

  // Everything the tests create is tracked here so afterAll can remove it.
  const tag = randomUUID().slice(0, 8);
  const classIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    assertLocalDatabase(TEST_DB_URL!);
    // PrismaService reads DATABASE_URL when it is constructed.
    process.env.DATABASE_URL = TEST_DB_URL;
    prisma = new PrismaService();
    await prisma.$connect();
    repo = new ClassesRepository(prisma, fakeCache as any, fakeEvents as any);
  }, 60_000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.pendingSeat.deleteMany({ where: { classId: { in: classIds } } });
    await prisma.classMember.deleteMany({ where: { classId: { in: classIds } } });
    await prisma.class.deleteMany({ where: { id: { in: classIds } } });
    await prisma.memberProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }, 60_000);

  // Helpers

  async function createMembers(count: number): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const user = await prisma.user.create({
        data: {
          name: `Seat Test ${i}`,
          email: `seat-${tag}-${randomUUID()}@integration.test`,
          password: 'not-a-real-hash',
          memberProfile: { create: {} },
        },
        include: { memberProfile: true },
      });
      userIds.push(user.id);
      ids.push(user.memberProfile!.id);
    }
    return ids;
  }

  async function createClass(capacity: number | null): Promise<string> {
    const cls = await prisma.class.create({
      data: {
        name: `Seat race ${tag}`,
        schedule: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        capacity,
      },
    });
    classIds.push(cls.id);
    return cls.id;
  }

  const countByStatus = (results: { status: string }[]) => {
    const counts: Record<string, number> = {};
    for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1;
    return counts;
  };

  // Concurrent bookings for the last seats

  it('never oversells: 20 simultaneous bookings on a 5-seat class give exactly 5 holds', async () => {
    const members = await createMembers(20);
    const classId = await createClass(5);

    const results = await Promise.all(
      members.map((m) => repo.reserveSeat(classId, m, 15)),
    );

    expect(countByStatus(results)).toEqual({ reserved: 5, 'class-full': 15 });
    expect(await prisma.pendingSeat.count({ where: { classId } })).toBe(5);
  }, 60_000);

  it('stays correct when the race is repeated (5 rounds of 12 people for 3 seats)', async () => {
    const members = await createMembers(12);

    for (let round = 0; round < 5; round++) {
      const classId = await createClass(3);
      const results = await Promise.all(
        members.map((m) => repo.reserveSeat(classId, m, 15)),
      );
      expect(countByStatus(results)).toEqual({ reserved: 3, 'class-full': 9 });
      expect(await prisma.pendingSeat.count({ where: { classId } })).toBe(3);
    }
  }, 120_000);

  it('the last seat goes to exactly one of two simultaneous bookers', async () => {
    const [a, b] = await createMembers(2);
    const classId = await createClass(1);

    const results = await Promise.all([
      repo.reserveSeat(classId, a, 15),
      repo.reserveSeat(classId, b, 15),
    ]);

    expect(countByStatus(results)).toEqual({ reserved: 1, 'class-full': 1 });
  }, 60_000);

  // What counts toward capacity

  it('counts confirmed members AND active holds toward capacity', async () => {
    const members = await createMembers(10);
    const classId = await createClass(5);

    // 2 confirmed members and 1 active hold already exist: 2 seats are left.
    await prisma.classMember.createMany({
      data: [members[0], members[1]].map((memberProfileId) => ({
        classId,
        memberProfileId,
      })),
    });
    await prisma.pendingSeat.create({
      data: {
        classId,
        memberProfileId: members[2],
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    const results = await Promise.all(
      members.slice(3).map((m) => repo.reserveSeat(classId, m, 15)),
    );

    expect(countByStatus(results)).toEqual({ reserved: 2, 'class-full': 5 });
  }, 60_000);

  it('does not count expired holds', async () => {
    const [a, b] = await createMembers(2);
    const classId = await createClass(1);

    await prisma.pendingSeat.create({
      data: {
        classId,
        memberProfileId: a,
        expiresAt: new Date(Date.now() - 60 * 1000), // already lapsed
      },
    });

    const result = await repo.reserveSeat(classId, b, 15);
    expect(result.status).toBe('reserved');
  }, 60_000);

  it('a class with no capacity limit never reports full', async () => {
    const members = await createMembers(8);
    const classId = await createClass(null);

    const results = await Promise.all(
      members.map((m) => repo.reserveSeat(classId, m, 15)),
    );

    expect(countByStatus(results)).toEqual({ reserved: 8 });
  }, 60_000);

  // One member, many clicks

  it('the same member double-clicking gets one hold, not several', async () => {
    const [member] = await createMembers(1);
    const classId = await createClass(10);

    const results = await Promise.all(
      Array.from({ length: 6 }, () => repo.reserveSeat(classId, member, 15)),
    );

    expect(countByStatus(results)).toEqual({ reserved: 1, 'active-hold': 5 });
    expect(await prisma.pendingSeat.count({ where: { classId } })).toBe(1);
  }, 60_000);

  it('an already enrolled member is told so', async () => {
    const [member] = await createMembers(1);
    const classId = await createClass(10);
    await prisma.classMember.create({ data: { classId, memberProfileId: member } });

    const result = await repo.reserveSeat(classId, member, 15);
    expect(result.status).toBe('already-enrolled');
  }, 60_000);

  it('an unknown class gives class-not-found', async () => {
    const [member] = await createMembers(1);
    const result = await repo.reserveSeat(randomUUID(), member, 15);
    expect(result.status).toBe('class-not-found');
  }, 60_000);

  // Confirming a hold

  it('confirming holds turns them into members, and the class then reads as full', async () => {
    const members = await createMembers(6);
    const classId = await createClass(5);

    for (const m of members.slice(0, 5)) {
      expect((await repo.reserveSeat(classId, m, 15)).status).toBe('reserved');
    }

    // Payments confirming at the same moment (webhook + verify + sweep).
    const confirmed = await Promise.all(
      members.slice(0, 5).map((m) => repo.confirmHold(classId, m)),
    );
    expect(confirmed.every((c) => c !== null)).toBe(true);
    expect(await prisma.classMember.count({ where: { classId } })).toBe(5);
    expect(await prisma.pendingSeat.count({ where: { classId } })).toBe(0);

    expect((await repo.reserveSeat(classId, members[5], 15)).status).toBe(
      'class-full',
    );
  }, 60_000);

  it('confirmHold is idempotent: a repeated webhook does not create a second member', async () => {
    const [member] = await createMembers(1);
    const classId = await createClass(5);
    await repo.reserveSeat(classId, member, 15);

    const first = await repo.confirmHold(classId, member);
    const second = await repo.confirmHold(classId, member); // no hold left

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(await prisma.classMember.count({ where: { classId } })).toBe(1);
  }, 60_000);

  it('confirmHold returns null for an expired hold', async () => {
    const [member] = await createMembers(1);
    const classId = await createClass(5);
    await prisma.pendingSeat.create({
      data: {
        classId,
        memberProfileId: member,
        expiresAt: new Date(Date.now() - 60 * 1000),
      },
    });

    expect(await repo.confirmHold(classId, member)).toBeNull();
    expect(await prisma.classMember.count({ where: { classId } })).toBe(0);
  }, 60_000);

  // The database's own safety net

  it('the database itself rejects enrolling the same member twice', async () => {
    const [member] = await createMembers(1);
    const classId = await createClass(5);
    await prisma.classMember.create({ data: { classId, memberProfileId: member } });

    await expect(
      prisma.classMember.create({ data: { classId, memberProfileId: member } }),
    ).rejects.toThrow();
  }, 60_000);
});
