# ADR 0001: Use row-level locking (`SELECT ... FOR UPDATE`) for seat holds

- **Status:** Accepted
- **Scope:** NestJS backend

## Context

The original Express backend claimed a seat with one atomic MongoDB `findOneAndUpdate`. PostgreSQL has no equivalent single-document operation, because a class's confirmed members (`ClassMember`) and active holds (`PendingSeat`) live in separate tables. A plain "count the seats, then insert" is a check-then-write pair, so two people paying for the last seat at the same moment could both pass the check and oversell the class.

## Decision

Inside one transaction, `ClassesRepository.reserveSeat` locks the class row with `SELECT ... FOR UPDATE`, counts confirmed members plus unexpired holds, and inserts the hold only if there is room. Concurrent bookings for the same class queue on the lock, so the count each one sees is exact. A hold lasts 15 minutes (`SEAT_HOLD_MINUTES`) and `confirmHold` turns it into a member when the payment is verified. The repository returns a result code (`reserved`, `class-full`, `already-enrolled`, `active-hold`, `class-not-found`) and never throws HTTP errors; the service maps codes to responses.

## Options considered

- **Alternative: a denormalised `seatsTaken` counter on `Class`.** Rejected: a second source of truth that can drift from the real rows after a crash or a manual edit.
- **Alternative: optimistic retry (serializable isolation or a version column).** Workable, but adds retry loops to application code for something the database can simply serialise.
- **Alternative: a Redis lock.** Rejected: seat correctness would then depend on Redis, which the system treats as optional (see [ADR 0004](0004-cache-aside-fails-open.md)).

## Consequences

- Seat correctness lives in Postgres alone and never depends on the cache.
- Bookings for one class are serialised, which is the intended behaviour; different classes do not block each other.
- The behaviour is proven, not assumed: 13 tests run against a real Postgres in CI, including 20 simultaneous bookings for 5 seats, which must give exactly 5 holds (see [TESTING.md](../TESTING.md)). Unit tests with fakes cannot prove a SQL lock.
- Transactions use shared `TX_OPTIONS` (`maxWait` 10 s, `timeout` 20 s) to tolerate a distant database.
