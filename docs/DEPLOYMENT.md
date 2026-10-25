# Deployment

How the API is packaged and released: Docker for local use and for the host, a Kubernetes demonstration, and the live Render + Neon + Vercel setup.

## Contents

- [Docker](#docker)
- [Kubernetes](#kubernetes)
- [Live deployment (Render, Neon, Vercel)](#live-deployment-render-neon-vercel)

## Docker

One command runs the API, Redis and Jaeger (Postgres stays on Neon):

```bash
cp .env.example .env            # fill in real values (never commit .env)
docker stop gym-redis gym-jaeger 2>/dev/null   # free the ports if you ran them by hand
docker compose up -d --build
curl http://localhost:3001/api/health
```

- The image is a multi-stage build that runs `node dist/main.js` as a non-root user under `tini`, with a health check on `/api/health`. Secrets are never baked in: they come from `.env` at run time.
- Compose sets `NODE_ENV=development` locally and overrides `REDIS_URL` and `OTEL_EXPORTER_OTLP_ENDPOINT` to point at the `redis` and `jaeger` containers. The image itself defaults to production, which enforces a 32+ character `JWT_SECRET`.
- Migrations are a separate release step, not run at container start. Use Neon's direct (non-pooler) connection string:
  `docker compose run --rm api npx prisma migrate deploy`
- Seed an admin: `docker compose run --rm -e ADMIN_PASSWORD=... api node dist/seed/admin.seed.js`
- Coding on your PC instead? `docker compose up -d redis jaeger`, then `npm run start:dev`.
- `docker build` uses `npm ci`, so `package-lock.json` must be committed and in sync with `package.json`.

## Kubernetes

The `k8s/` folder runs the same image on a local cluster (Docker Desktop's Kubernetes, minikube or kind). It is a demonstration of the packaging; the live site stays on Render.

| File                                                 | What it is                                                                                                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `namespace.yaml`                                     | The `gym-ontime` namespace                                                                                                                                 |
| `configmap.yaml`                                     | Non-secret settings (`NODE_ENV`, `FRONTEND_URL`, `REDIS_URL`, `SWAGGER_ENABLED`, ...)                                                                      |
| `deployment.yaml`                                    | The API: one replica, `Recreate` strategy, startup/readiness probes on `/api/health`, liveness on the TCP port, resource limits, non-root security context |
| `service.yaml`                                       | ClusterIP Service on port 3001                                                                                                                             |
| `redis.yaml`                                         | A small Redis (`noeviction`, no persistence) for the cache and the queue                                                                                   |
| `templates/secret.example.yaml`                      | Secret **template** with placeholders only                                                                                                                 |
| `optional/ingress.yaml`, `optional/migrate-job.yaml` | Ingress, and a one-off `prisma migrate deploy` Job                                                                                                         |

```bash
docker build -t gym-ontime-backend:local .      # minikube: minikube image load gym-ontime-backend:local
                                                # kind:     kind load docker-image gym-ontime-backend:local
kubectl apply -f k8s/namespace.yaml
kubectl -n gym-ontime create secret generic gym-ontime-secrets --from-env-file=.env.k8s
kubectl apply -k k8s/
kubectl -n gym-ontime get pods -w
kubectl -n gym-ontime port-forward svc/gym-ontime-api 3001:3001
curl http://localhost:3001/api/health           # API docs: http://localhost:3001/api/docs
```

Details, the Secret file format and troubleshooting are in [`k8s/README.md`](../k8s/README.md). The API runs a single replica on purpose (see [Known limitations](../README.md#known-limitations)).

## Live deployment (Render, Neon, Vercel)

Live setup (since October 2026):

| Part     | Host                                                  | Notes                                                                                             |
| -------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Frontend | Vercel                                                | `https://gym-ontime.vercel.app`; `NEXT_PUBLIC_NEST_API_URL` points at this API                    |
| API      | Render web service, Docker, Ohio (US East), free tier | Built from the repo `Dockerfile`; health check path `/api/health`                                 |
| Redis    | Render Key Value (Valkey), Ohio                       | Internal URL in `REDIS_URL`; `noeviction` policy for the queue                                    |
| Database | Neon PostgreSQL, us-east-2                            | Same region as the API, so queries take about 3 ms instead of about 270 ms from a distant machine |
| Payments | Paystack (test mode)                                  | Webhook URL: `<api-url>/api/payments/webhook`                                                     |

**How a release works:** push to `master`, GitHub Actions runs the type-check, build, unit tests, Docker build and the real-Postgres tests, and only when all of them are green does Render's auto-deploy (set to "After CI Checks Pass") rebuild the image and swap it in once `/api/health` passes. Migrations are a manual step because the free plan has no pre-deploy command: run `npx prisma migrate deploy` against Neon's direct (non-pooler) connection string before pushing a schema change.

**Free tier behaviour:** the API sleeps after about 15 minutes idle and wakes on the next request (up to a minute). Background jobs (payment sweep, subscription expiry, class reminders) only run while it is awake. A paid instance removes the sleeping.

To deploy your own copy:

1. Create a Redis instance and a Docker web service from this repo in the **same region as the database**. Do not set `PORT`; the platform provides it.
2. Set production values: `NODE_ENV=production`, `DATABASE_URL`, a `JWT_SECRET` of 32+ characters, `PAYSTACK_SECRET_KEY`, `FRONTEND_URL` (https), `REDIS_URL`, `CLOUDINARY_*` and `FIREBASE_*`. Add `CORS_ORIGINS` if more than one frontend origin is needed (it replaces the defaults).
3. Set the health check path to `/api/health`.
4. Run `npx prisma migrate deploy` against the database's direct connection string.
5. Point the Paystack dashboard webhook at `<api-url>/api/payments/webhook`.
6. Set a strong `ADMIN_PASSWORD` before seeding the admin (never the development default).
7. Check `<api-url>/api/health`, then log in from the frontend (the production cookie is `SameSite=None; Secure`, so it needs https end to end; Safari may block cross-site cookies).

Before running more than one instance, replace the single-instance pieces listed under [Known limitations](../README.md#known-limitations).
