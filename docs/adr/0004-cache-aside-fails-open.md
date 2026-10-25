# ADR 0004: Cache-aside in repositories, and every optional dependency fails open

- **Status:** Accepted
- **Scope:** NestJS backend

## Context

Class listings are read far more often than they change, and a round trip from a distant region to Neon costs hundreds of milliseconds per query. Redis, Firebase and Jaeger are useful but none of them may be allowed to take the API down.

## Decision

Caching lives inside repositories (`wrap(key, ttl, loader)`, 60 s TTL for the class list and detail, `null` never cached) and is invalidated after the transaction commits. The Redis client is configured to fail fast (`enableOfflineQueue: false`, 500 ms command timeout, 2 s connect timeout) and errors are logged at most once every 30 seconds. Seat reservation, payments and notifications are never cached, and the live WebSocket counts read Postgres directly. Push (`PushService`) and tracing follow the same rule: a missing Firebase key or an unreachable Jaeger disables the feature and never throws into a request.

## Options considered

- **Alternative: cache in the service or controller layer.** Rejected: invalidation would be scattered away from the writes that cause it.
- **Alternative: treat Redis as required.** Rejected: it would turn a cache outage into an API outage.

## Consequences

- With Redis down the API answers `degraded` on `/api/health` and keeps serving from Postgres.
- A cached response can be up to 60 seconds stale after changes made outside the app. Trainer-phone redaction for anonymous callers is applied after the cache so cached data is shared safely.
- If `REDIS_URL` is unset the cache and the queue module are simply skipped.
