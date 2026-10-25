# ADR 0008: Health semantics: `ok` / `degraded` / `error`, and TCP liveness

- **Status:** Accepted
- **Scope:** NestJS backend

## Context

Platforms restart a container whose health check fails. If a Redis or database outage made the liveness check fail, the platform would restart a healthy process in a loop without fixing anything.

## Decision

`GET /api/health` is public and reports `ok` (200), `degraded` (200, database up and Redis down) or `error` (503, database down), with per-dependency latency and no connection strings. Render uses it as the health check path and Kubernetes uses it for the **startup** and **readiness** probes. The Kubernetes **liveness** probe is a TCP check on the port instead, because restarting cannot repair a Neon or Redis outage.

## Options considered

- **Alternative: liveness on `/api/health`.** Rejected for the reason above.
- **Alternative: `error` when Redis is down.** Rejected: Redis is optional ([ADR 0004](0004-cache-aside-fails-open.md)), so its absence must not stop traffic.

## Consequences

- A dependency outage stops traffic (readiness) without causing restart loops.
- The endpoint is deliberately unauthenticated and carries no secrets or error text.
