import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { CLASSES_PREFIX } from './cache-keys.js';

/**
 * Thin Redis wrapper used by repositories (cache-aside).
 *
 * THE CACHE IS AN OPTIMISATION, NEVER A DEPENDENCY. Every method here
 * swallows Redis errors and degrades to "no cache":
 *   - REDIS_URL not set  -> cache disabled, every call is a no-op / miss
 *   - Redis down         -> commands fail fast (no offline queue, short
 *                           timeout) and the caller falls through to Postgres
 * so stopping the Redis container never takes the API down.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly client: Redis | null;
  private lastErrorLogAt = 0;

  constructor() {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.client = null;
      this.logger.warn('REDIS_URL is not set: caching is disabled.');
      return;
    }

    this.client = new Redis(url, {
      // Fail fast instead of queueing commands while disconnected; a queued
      // command would hang the HTTP request until Redis came back.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      commandTimeout: 500,
      // Keep trying to reconnect forever, backing off up to 5s.
      retryStrategy: (times) => Math.min(times * 500, 5000),
    });

    // Without an 'error' listener ioredis spams "Unhandled error event".
    // Log it, but at most once every 30s so a dead Redis doesn't flood logs.
    this.client.on('error', (err) => {
      const now = Date.now();
      if (now - this.lastErrorLogAt > 30_000) {
        this.lastErrorLogAt = now;
        // Connection failures (ECONNREFUSED on IPv4 + IPv6) arrive as an
        // AggregateError whose `message` is empty, so fall back to the code.
        const detail =
          err.message || (err as NodeJS.ErrnoException).code || err.name;
        this.logger.warn(`Redis error (serving from Postgres): ${detail}`);
      }
    });
    this.client.on('ready', () => this.logger.log('Redis connected'));
  }

  /**
   * Cache-aside: return the cached value if present, otherwise run `loader`
   * (the Prisma query), cache its result and return it.
   *
   * - `null`/`undefined` results are NOT cached, so "class not found" is
   *   never remembered.
   * - Values go through JSON, so Date and Decimal come back as strings. Only
   *   use this for reads whose consumer tolerates that (transformClass does:
   *   it wraps schedule in new Date() and Number()s the prices).
   * - Logs HIT/MISS with timings so before/after numbers are visible.
   */
  async wrap<T>(
    key: string,
    ttlSeconds: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    const t0 = performance.now();
    const cached = await this.get<T>(key);
    if (cached !== null) {
      this.logger.debug(`HIT  ${key} (${Math.round(performance.now() - t0)}ms)`);
      return cached;
    }

    const t1 = performance.now();
    const fresh = await loader();
    this.logger.debug(`MISS ${key} (db ${Math.round(performance.now() - t1)}ms)`);

    if (fresh !== null && fresh !== undefined) {
      await this.set(key, fresh, ttlSeconds);
    }
    return fresh;
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.client) return null;
    try {
      const raw = await this.client.get(key);
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch {
      return null; // miss; the error listener already logged connection issues
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      /* best effort */
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (!this.client || keys.length === 0) return;
    try {
      await this.client.unlink(...keys);
    } catch {
      /* best effort */
    }
  }

  /** Deletes every key starting with `prefix` (SCAN, never KEYS). */
  async delByPrefix(prefix: string): Promise<void> {
    if (!this.client) return;
    try {
      const keys: string[] = [];
      const stream = this.client.scanStream({ match: `${prefix}*`, count: 100 });
      for await (const batch of stream) keys.push(...(batch as string[]));
      if (keys.length > 0) await this.client.unlink(...keys);
      this.logger.debug(`INVALIDATE ${prefix}* (${keys.length} keys)`);
    } catch {
      /* best effort */
    }
  }

  /**
   * For the health endpoint. 'disabled' = no REDIS_URL (not a failure);
   * 'down' if Redis does not answer (commandTimeout is 500ms and the
   * offline queue is off, so this fails fast instead of hanging).
   */
  async ping(): Promise<'up' | 'down' | 'disabled'> {
    if (!this.client) return 'disabled';
    try {
      return (await this.client.ping()) === 'PONG' ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }

  /**
   * Call AFTER a write has committed (after the $transaction promise
   * resolves), never before: invalidating first would let a concurrent read
   * re-cache the not-yet-committed old data.
   */
  invalidateClasses(): Promise<void> {
    return this.delByPrefix(CLASSES_PREFIX);
  }

  async onModuleDestroy() {
    try {
      await this.client?.quit();
    } catch {
      this.client?.disconnect();
    }
  }
}
