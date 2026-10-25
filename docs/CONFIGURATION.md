# Configuration

Copy [`.env.example`](../.env.example) to `.env`. The app validates its settings at boot and exits with a clear message if a required one is missing.

| Variable                                                               | Required      | Default                         | Description                                                                      |
| ---------------------------------------------------------------------- | ------------- | ------------------------------- | -------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                         | Yes           |                                 | PostgreSQL connection string (pooled Neon URL for the app)                       |
| `PAYSTACK_SECRET_KEY`                                                  | Yes           |                                 | Paystack secret key (`sk_test_...` in development)                               |
| `JWT_SECRET`                                                           | In production | dev fallback                    | 32+ characters when `NODE_ENV=production` (boot fails otherwise)                 |
| `FRONTEND_URL`                                                         | In production |                                 | Frontend origin; Paystack redirects to `${FRONTEND_URL}/payment-success`         |
| `NODE_ENV`                                                             | No            |                                 | `production` enables the cross-site cookie, stricter validation and proxy trust  |
| `PORT`                                                                 | No            | `3001`                          | HTTP port                                                                        |
| `CORS_ORIGINS`                                                         | No            | localhost and the Vercel origin | Comma-separated allowed origins. **When set it replaces the defaults.**          |
| `COOKIE_CROSS_SITE`                                                    | No            | auto                            | `true` / `false` overrides the cookie `SameSite`/`Secure` detection              |
| `TRUST_PROXY_HOPS`                                                     | No            | 1 in production, else 0         | Number of proxies in front of the app (needed for per-client rate limits)        |
| `THROTTLE_DISABLED`                                                    | No            |                                 | `true` switches login rate limiting off (testing only)                           |
| `SWAGGER_ENABLED`                                                      | No            | `true`                          | `false` switches the `/api/docs` Swagger UI off                                  |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | No            |                                 | Image uploads (warns if missing)                                                 |
| `REDIS_URL`                                                            | No            |                                 | Enables cache and queue. Use `rediss://` for TLS                                 |
| `QUEUE_REDIS_DB`                                                       | No            | `1`                             | Redis DB used by the queue                                                       |
| `MAINTENANCE_INTERVAL_MINUTES`                                         | No            | `15`                            | How often the payment sweep runs                                                 |
| `PAYMENT_STALE_MINUTES`                                                | No            | `30`                            | Age at which a pending payment is re-verified                                    |
| `SUBSCRIPTION_EXPIRY_INTERVAL_MINUTES`                                 | No            | `60`                            | How often subscription expiry runs                                               |
| `CLASS_REMINDER_INTERVAL_MINUTES`                                      | No            | `15`                            | How often class reminders run                                                    |
| `CLASS_REMINDER_WINDOW_MINUTES`                                        | No            | `60`                            | How far ahead a class is reminded                                                |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | No            |                                 | Enable push. Push is disabled if any is missing                                  |
| `TEST_DATABASE_URL`                                                    | No            |                                 | Tests only: a LOCAL or CI Postgres for the real-database tests (refuses remote hosts) |
| `OTEL_ENABLED`                                                         | No            |                                 | `true` turns tracing on                                                          |
| `OTEL_SERVICE_NAME`                                                    | No            | `gym-ontime-backend`            | Service name shown in Jaeger                                                     |
| `OTEL_EXPORTER_OTLP_ENDPOINT`                                          | No            | `http://localhost:4318`         | OTLP HTTP endpoint                                                               |
| `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_AVATAR`, `ADMIN_PASSWORD`          | No            | see seed                        | Admin seed settings; `ADMIN_PASSWORD` is **required** when `NODE_ENV=production` |
