# ADR 0005: BullMQ repeatable jobs on a separate Redis database instead of in-process cron

- **Status:** Accepted
- **Scope:** NestJS backend

## Context

The Express version ran three `node-cron` timers inside the server process (payment cleanup, subscription expiry, class reminders). A failed run was simply lost, there was no retry, and nothing could trigger a run on demand.

## Decision

The three jobs are repeatable jobs on one BullMQ queue, `maintenance`, scheduled with `upsertJobScheduler` at boot. Each has 3 attempts with exponential backoff from 30 seconds, the worker runs one job at a time (`concurrency: 1`), and admins can queue any of them through `POST /api/maintenance/*`. The queue uses its own Redis database (`QUEUE_REDIS_DB`, default 1, prefix `gymq`), so queue keys can never collide with cache keys in DB 0. Each job runs inside a `job <name>` tracing span.

## Options considered

- **Alternative: keep `node-cron`.** Rejected: no retries, no visibility, no manual trigger.
- **Alternative: a separate worker process.** Not needed at this scale; the worker runs in the API process.

## Consequences

- Jobs are retried and are traceable. A job that throws is retried instead of silently skipped.
- Jobs are written to be safe to repeat (at-least-once): a subscription is expired by removing the member first and flipping the status last; a class is marked reminded only after every member was notified.
- The queue needs Redis, so `QueuesModule` is only loaded when `REDIS_URL` is set.
- On Render's free tier the service sleeps when idle, so jobs only run while it is awake.
