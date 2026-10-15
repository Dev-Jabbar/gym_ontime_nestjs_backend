import type { ConnectionOptions } from 'bullmq';

// Queue data lives in its own Redis logical DB (default 1) and under its
// own key prefix, so it can never collide with the cache, which uses DB 0
// and deletes by the `classes:` prefix only.
export const QUEUE_PREFIX = 'gymq';

// Call this lazily (inside a factory), never at module top level: it throws
// if REDIS_URL is unset or invalid.
export function buildQueueConnection(): ConnectionOptions {
  const raw = process.env.REDIS_URL;
  if (!raw) {
    throw new Error('REDIS_URL is not set: the job queue needs Redis.');
  }
  const url = new URL(raw);
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

// Every 15 minutes, same cadence as the Express classReminder cron. The
// window below is much larger than the interval, so no class is missed.
export const classReminderIntervalMs = () =>
  minutes('CLASS_REMINDER_INTERVAL_MINUTES', 15) * 60 * 1000;

// A class is reminded once its session starts within this many minutes.
export const reminderWindowMinutes = () =>
  minutes('CLASS_REMINDER_WINDOW_MINUTES', 60);

// A pending payment must be this old before the sweep re-checks it
// (gives the normal checkout + redirect + verify flow time to finish).
export const staleAfterMinutes = () => minutes('PAYMENT_STALE_MINUTES', 30);

// Anything Paystack still can't confirm after this long is forced to failed.
export const HARD_EXPIRY_HOURS = 24;
