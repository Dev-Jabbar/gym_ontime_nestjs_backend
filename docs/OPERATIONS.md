# Operations

Running, observing and fixing the API. Deployment steps are in [DEPLOYMENT.md](DEPLOYMENT.md).

## Contents

- [Health check](#health-check)
- [Runbooks](#runbooks)
- [Observability (OpenTelemetry tracing)](#observability-opentelemetry-tracing)
- [Troubleshooting](#troubleshooting)

## Health check

`GET /api/health` is public and never reports connection strings or error text.

| Status | HTTP | Meaning | What a platform should do |
| --- | --- | --- | --- |
| `ok` | 200 | Database and Redis answer | Nothing |
| `degraded` | 200 | Database up, Redis down. The API still serves from Postgres | Do **not** restart: restarting cannot fix a Redis outage |
| `error` | 503 | Database unreachable | Stop sending traffic (readiness), investigate |

The response also carries `uptimeSeconds` and a latency per dependency (timeouts: database 5 s, Redis 1.5 s). The Kubernetes manifests use it for the startup and readiness probes but deliberately **not** for liveness (see [ADR 0008](adr/0008-health-semantics-and-probes.md)).

## Runbooks

**Create the first admin.** `npm run seed:admin` (in the Docker image: `node dist/seed/admin.seed.js`). With `NODE_ENV=production` the `ADMIN_PASSWORD` variable is required; never use the development default on a public host. If the email already exists the seed never touches the password; it only makes sure the account is an active admin with a profile.

**Run a background job now.** Admin-only endpoints queue the job immediately: `POST /api/maintenance/run` (payment sweep), `POST /api/maintenance/expire-subscriptions`, `POST /api/maintenance/class-reminders`.

**Apply a schema change.** Migrations are a manual release step, not run at container start. Use Neon's **direct** (non-pooler) connection string: `npx prisma migrate deploy`. Run it before pushing code that needs the new schema, because a push to `master` deploys automatically once CI is green.

**Roll back a bad deploy.** `git revert HEAD` then `git push`; CI runs and Render redeploys the previous behaviour. Reverting a migration is a manual, separate decision.

**Confirm a deploy is real.** `git log --oneline -1` shows the new commit, the branch is up to date with `origin`, and the host shows a fresh deploy. Then check `/api/health`.

**Rotate a secret.** Change it at the provider (Neon, Paystack, Cloudinary, Firebase), update the value in the host's environment settings (and your local `.env`), redeploy. Never paste real values into chats, issues, commits or docs.

## Observability (OpenTelemetry tracing)

Tracing is optional and off by default. When on, every request and background job becomes a trace you can open in Jaeger: HTTP request, Nest controller, Postgres queries, Redis calls, outgoing HTTP (Paystack), queue jobs and the push send, each with its timing.

```bash
docker compose up -d redis jaeger   # Jaeger UI: http://localhost:16686
# in .env:
OTEL_ENABLED=true
npm run start:dev
```

Call the API, open http://localhost:16686, pick the `gym-ontime-backend` service and click **Find Traces**. `src/main.ts` starts tracing and only then imports the app (`src/bootstrap.ts`), because OpenTelemetry must wrap `express`, `pg` and `ioredis` before they load. Database and Redis spans are only recorded inside a request or job, and `/api/health` is ignored. Traces are held in memory by Jaeger and lost when the container stops.

The traces showed where time goes: most of a slow endpoint is one network round trip per SQL query, which disappears when the API runs in the same region as the database.

## Troubleshooting

| Symptom                                                                 | Cause and fix                                                                                                             |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `Can't reach database server` / `P1001`                                 | Neon free tier is cold-starting or briefly unreachable. Retry.                                                            |
| `P1000` authentication error                                            | Wrong database password in `DATABASE_URL`; copy the full connection string again.                                         |
| `P2028` transaction errors after many restarts                          | A stale Node process holds connections. Kill it and restart.                                                              |
| New route returns 404                                                   | A stale `start:dev` process. Restart it. `.env` changes also need a restart.                                              |
| `Redis error (serving from Postgres)` warnings                          | Redis is down. Expected and harmless; the API keeps working.                                                              |
| `/api/health` shows `degraded`                                          | Database up, Redis down. The API still serves.                                                                            |
| `Request failed with status code 401` on `initiate`                     | Wrong `PAYSTACK_SECRET_KEY`. The seat hold is released automatically.                                                     |
| `429 Too many attempts` on login                                        | Rate limit (10 per minute per IP). Wait a minute, or set `THROTTLE_DISABLED=true` locally.                                |
| Container restarts with `JWT_SECRET is too short`                       | The image runs in production mode. Use a 32+ character secret, or set `NODE_ENV=development` locally (compose does this). |
| Login does not stick over `http://localhost` with `NODE_ENV=production` | The production cookie is `Secure`; set `COOKIE_CROSS_SITE=false` for local http.                                          |
| `npm ci` fails ("lock file out of sync")                                | Run `npm install --legacy-peer-deps` and commit `package-lock.json`.                                                      |
| Push does nothing in Brave                                              | Enable "Use Google Services for Push Messaging", or test in Chrome.                                                       |
| Frontend picker shows NestJS as amber "waking up" (or red)             | The free Render service is asleep. Wait up to a minute, or open `/api/health` to wake it, then reload the picker.         |
| Real-Postgres tests show as skipped                                     | `TEST_DATABASE_URL` is not set. That is expected for plain `npm test`; see [Testing](TESTING.md).             |
