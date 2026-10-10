import type { ConnectionOptions } from 'bullmq';

// Queue data lives in its own Redis logical DB (default 1) and under its
// own key prefix, so it can never collide with the cache, which uses DB 0
// and deletes by the `classes:` prefix only.
export const QUEUE_PREFIX = 'gymq';

export function buildQueueConnection(): ConnectionOptions {
  const url = new URL(process.env.REDIS_URL as string);
  const db = Number(process.env.QUEUE_REDIS_DB ?? 1);

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: Number.isInteger(db) && db >= 0 ? db : 1,
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}

const minutes = (envName: string, fallback: number) => {
  const n = Number(process.env[envName]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// Every 15 minutes, same cadence as the Express cron.
export const sweepIntervalMs = () =>
  minutes('MAINTENANCE_INTERVAL_MINUTES', 15) * 60 * 1000;

// Every hour, same cadence as the Express subscriptionExpiry cron. A
// subscription lapsing up to an hour late is not a meaningful problem.
export const subscriptionExpiryIntervalMs = () =>
  minutes('SUBSCRIPTION_EXPIRY_INTERVAL_MINUTES', 60) * 60 * 1000;

// A pending payment must be this old before the sweep re-checks it
// (gives the normal checkout + redirect + verify flow time to finish).
export const staleAfterMinutes = () => minutes('PAYMENT_STALE_MINUTES', 30);

// Anything Paystack still can't confirm after this long is forced to failed.
export const HARD_EXPIRY_HOURS = 24;
