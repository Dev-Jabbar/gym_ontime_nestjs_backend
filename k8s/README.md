# Running Gym Ontime on Kubernetes (local demo)

These manifests run the API and a small Redis on a local cluster. The database stays on Neon (outside the cluster). The live site is hosted on Render; this folder only shows how the same Docker image runs on Kubernetes.

## What you need

- Docker Desktop with Kubernetes switched on (Settings, Kubernetes, Enable), **or** minikube, **or** kind
- `kubectl` (Docker Desktop and minikube install it)
- Your local `.env` values (database URL, JWT secret, Paystack test key)

Check the cluster is reachable: `kubectl get nodes` should list one node in `Ready` state.

## 1. Build the image and make the cluster see it

From the repo root:

```bash
docker build -t gym-ontime-backend:local .
```

- **Docker Desktop Kubernetes:** nothing more, it shares your local images.
- **minikube:** `minikube image load gym-ontime-backend:local`
- **kind:** `kind load docker-image gym-ontime-backend:local`

## 2. Create the namespace

```bash
kubectl apply -f k8s/namespace.yaml
```

## 3. Create the Secret (real values, never committed)

Copy your `.env` to `.env.k8s` (that name is already git-ignored) and keep only what the cluster needs:

```
DATABASE_URL=postgresql://...
JWT_SECRET=a-random-string-of-48-or-more-characters
PAYSTACK_SECRET_KEY=sk_test_...
```

Optional extras in the same file: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, and for push `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.

Rules for the file:

- **No quotes around values.** Unlike a normal `.env` reader, `kubectl` keeps quotes as part of the value. This matters most for `FIREBASE_PRIVATE_KEY` (one line, literal `\n`, no surrounding quotes).
- Save it with LF line endings (VS Code shows CRLF/LF in the bottom bar).
- Leave out `PORT`, `NODE_ENV`, `REDIS_URL` and `FRONTEND_URL`: those come from `configmap.yaml`. (Extra keys would be ignored anyway, because the Deployment lists secret keys one by one.)

Then:

```bash
kubectl -n gym-ontime create secret generic gym-ontime-secrets --from-env-file=.env.k8s
kubectl -n gym-ontime describe secret gym-ontime-secrets     # shows key names and sizes, not values
```

To change a value later: `kubectl -n gym-ontime delete secret gym-ontime-secrets`, create it again, then `kubectl -n gym-ontime rollout restart deployment/gym-ontime-api`.

Prefer YAML? Copy `k8s/templates/secret.example.yaml` to `k8s/secret.yaml` (git-ignored), fill it in and `kubectl apply -f k8s/secret.yaml`.

## 4. Deploy

```bash
kubectl apply -k k8s/
kubectl -n gym-ontime get pods -w
```

Wait until both pods show `1/1 Running` (Ctrl+C to stop watching). The API pod can take up to a minute: it is `0/1` until `/api/health` answers.

## 5. Try it

```bash
kubectl -n gym-ontime port-forward svc/gym-ontime-api 3001:3001
```

Leave that running and, in another terminal or the browser:

- `http://localhost:3001/api/health` should show `"status":"ok"` with database and Redis `up`
- `http://localhost:3001/api/docs` is the Swagger page

To use the frontend, run it on port 4000 and pick **NestJS** (it talks to `http://localhost:3001/api`, which the port-forward now serves). Stop any other copy of the API first (`docker compose stop api`, or the `npm run start:dev` window), because only one thing can use port 3001.

## Migrations and seeding

The API never migrates at start-up. Your Neon database already has the tables, so you normally do nothing. For a fresh database, add `DATABASE_URL_DIRECT` (Neon's **direct** connection string, host without `-pooler`) to the Secret and run:

```bash
kubectl apply -f k8s/optional/migrate-job.yaml
kubectl -n gym-ontime logs job/gym-ontime-migrate
kubectl -n gym-ontime delete job gym-ontime-migrate
```

Seed an admin: `kubectl -n gym-ontime exec deploy/gym-ontime-api -- node dist/seed/admin.seed.js` (set `ADMIN_PASSWORD` first with `kubectl -n gym-ontime set env deploy/gym-ontime-api ADMIN_PASSWORD=...` if the database has no admin yet; remove it afterwards).

## Optional: Ingress

```bash
minikube addons enable ingress          # or install ingress-nginx
kubectl apply -f k8s/optional/ingress.yaml
```

Add `127.0.0.1 gym-ontime.local` to your hosts file (minikube: use `minikube ip`), set `TRUST_PROXY_HOPS: "1"` in `configmap.yaml`, re-apply with `kubectl apply -k k8s/`, then open `http://gym-ontime.local/api/health`.

## Design notes

- **One replica, `Recreate` strategy.** The WebSocket gateway, the in-memory login rate limiter and the class-reminder job all live inside one process. Two pods would double reminders and split live seat counts. Before scaling: add the socket.io Redis adapter, a shared throttler store and a lock for the reminder job.
- **Probes.** `startupProbe` and `readinessProbe` call `/api/health` (200 = ok or degraded, 503 = database down, so a pod with no database receives no traffic). `livenessProbe` only checks the TCP port: restarting a pod cannot repair a Neon or Redis outage, so tying liveness to the database would just cause restart loops.
- **Secrets by key.** The Deployment names each secret key explicitly instead of loading the whole Secret, so a Secret created from a full `.env` cannot override the ConfigMap (for example `REDIS_URL=localhost`).
- **Security context.** Non-root (uid 1000), no privilege escalation, all capabilities dropped, default seccomp profile.
- **Redis.** `noeviction` (BullMQ must never lose keys) and no persistence: the cache and job schedules rebuild on boot. Use a managed Redis for anything real and change `REDIS_URL`.

## Troubleshooting

| Symptom | Fix |
| ------- | --- |
| Pod `ErrImagePull` / `ImagePullBackOff` | The cluster cannot see the local image. Redo step 1 for your cluster type. |
| Pod `CreateContainerConfigError` | The Secret is missing or lacks `DATABASE_URL`, `JWT_SECRET` or `PAYSTACK_SECRET_KEY`. Check `kubectl -n gym-ontime describe pod <pod>`. |
| Pod `CrashLoopBackOff` | `kubectl -n gym-ontime logs deploy/gym-ontime-api`. The app prints which environment variable is missing or invalid. |
| Pod `Running` but `0/1` | The database is unreachable or Neon is waking up (give it a minute). Check `kubectl -n gym-ontime logs deploy/gym-ontime-api`. |
| `port-forward` says port 3001 is in use | Stop the other API (`docker compose stop api` or the `npm run start:dev` window). |
| Login works but the cookie is not kept | Keep `NODE_ENV: "development"` for plain http. In production mode the cookie needs https. |

## Clean up

```bash
kubectl delete -k k8s/
kubectl -n gym-ontime delete secret gym-ontime-secrets
kubectl delete namespace gym-ontime
```
