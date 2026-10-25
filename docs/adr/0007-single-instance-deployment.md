# ADR 0007: Run a single instance, and document the path to several

- **Status:** Accepted
- **Scope:** NestJS backend

## Context

Three pieces of state live inside one process: the WebSocket gateway (a browser connected to copy A never hears events produced on copy B), the in-memory login rate limiter (three copies would allow 30 attempts a minute instead of 10), and the class-reminder job (no lock, so two copies could send the same reminder). Seat booking, by contrast, is already safe with many instances, because the lock lives in Postgres ([ADR 0001](0001-row-locking-for-seat-holds.md)).

## Decision

Deploy exactly one replica. The Kubernetes Deployment uses `replicas: 1` with `strategy: Recreate`, and the README lists the limitation openly. Going beyond one instance needs three changes first: `@socket.io/redis-adapter` for the gateway, a shared Redis store for the throttler, and a Redis lock around the reminder job.

## Options considered

- **Alternative: build multi-instance support now.** Not worth it on a single free-tier instance; it would only allow raising a replica count that nothing needs. It is listed on the roadmap.

## Consequences

- Simple to operate and to reason about; no hidden cross-instance bugs.
- A rolling update is not available (`Recreate` means a brief gap on deploy).
- Horizontal scaling is a known, bounded piece of work rather than a surprise.
