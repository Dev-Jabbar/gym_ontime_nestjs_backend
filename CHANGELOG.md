# Changelog

All notable changes to the backend are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project does not publish version tags yet, so entries are grouped by date, newest first.

## 2026-10-24

### Added
- Interactive API documentation (Swagger UI) at `/api/docs`, generated from the controllers and DTOs; switch off with `SWAGGER_ENABLED=false`.
- Automated tests: 102 unit tests, plus 13 tests against a real PostgreSQL covering concurrent seat booking (20 simultaneous bookings for 5 seats give exactly 5 holds).
- Second GitHub Actions workflow, `Integration (Postgres)`: applies the migrations to an empty database, runs the real-Postgres tests, then starts the built API and smoke-tests register, login and `/users/me`.
- Kubernetes manifests (`k8s/`): single replica with `Recreate`, startup/readiness probes on `/api/health`, TCP liveness, non-root security context, Redis, a Secret template and optional Ingress and migrate Job.
- Admins are alerted (in-app and push) when a charged payment needs manual review.
- Project documentation set: architecture, decision records, API, configuration, testing, deployment and operations guides, contributing and security policies.

### Changed
- Render now deploys only after both CI workflows pass ("After CI Checks Pass").
- Docker build retries `npm ci` and caches the npm download directory, for slow networks.

## 2026-10-23

### Changed
- Removed the `_id` aliases from payments and notifications responses; the frontend reads `_id ?? id` so both backends work ([ADR 0006](docs/adr/0006-frontend-accepts-both-id-shapes.md)).
- Rewrote the README for the live deployment.

### Added
- Live deployment: API on Render, Redis on Render Key Value, PostgreSQL on Neon, frontend on Vercel. Paystack webhook URL configured.

## 2026-10-18 to 2026-10-21

### Added
- Multi-stage `Dockerfile` (non-root, `tini`, health check) and `docker-compose.yml` (API, Redis, Jaeger).
- First GitHub Actions workflow, `CI`: type-check, build, unit tests and a Docker image build.

## 2026-10-15 to 2026-10-16

### Added
- `GET /api/health` (database and Redis status).
- `helmet` security headers, rate limiting on login and register, environment-aware cookie, CORS from environment, environment validation at boot.
- Trainer privacy rules (phone hidden from anonymous callers, date of birth admin-only); booking a class that already started is rejected.

### Fixed
- Boot crash when `REDIS_URL` was unset (the queue connection was built at import time).

## 2026-10-13

### Added
- OpenTelemetry tracing to Jaeger (off unless `OTEL_ENABLED=true`).

### Fixed
- Paystack webhook signature is now computed over the raw request body ([ADR 0003](docs/adr/0003-webhook-signature-over-raw-body.md)).

## 2026-10-09 to 2026-10-11

### Added
- BullMQ queue with three repeatable jobs: payment sweep, subscription expiry and class reminders ([ADR 0005](docs/adr/0005-bullmq-repeatable-jobs.md)).
- Firebase Cloud Messaging push notifications and device-token endpoints.
- WebSocket gateway (`/classes` namespace) for live seat counts.
- Lock-down of member and trainer endpoints.

## 2026-09-25 to 2026-10-03

### Added
- NestJS + Prisma + PostgreSQL rebuild of the Express API, keeping the same `/api/...` paths: auth, users, classes, member/trainer/admin profiles, notifications, uploads, payments with seat holds ([ADR 0001](docs/adr/0001-row-locking-for-seat-holds.md)).
- Redis cache-aside layer that fails open ([ADR 0004](docs/adr/0004-cache-aside-fails-open.md)).
- Admin seed script.
