import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { CLASSES_PREFIX } from './cache-keys.js';

/**
 * Thin Redis wrapper used by repositories (cache-aside).
 *
 * The cache is an optimisation, never a dependency. Every method swallows
 * Redis errors and degrades to "no cache":
 *   - REDIS_URL not set: the cache is disabled and every call is a miss.
 *   - Redis down: commands fail fast (no offline queue, short timeout) and
 *     the caller falls through to Postgres.
 * Stopping Redis therefore never takes the API down.
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
      // Keep reconnecting indefinitely, backing off up to 5s.
      retryStrategy: (times) => Math.min(times * 500, 5000),
    });

    // Without an 'error' listener ioredis logs "Unhandled error event". Log
    // it ourselves, at most once every 30s, so a dead Redis cannot flood the
    // logs.
    this.client.on('error', (err) => {
      const now = Date.now();
      if (now - this.lastErrorLogAt > 30_000) {
        this.lastErrorLogAt = now;
        // Connection failures (ECONNREFUSED on IPv4 and IPv6) arrive as an
        // AggregateError with an empty `message`, so fall back to the code.
        const detail =
          err.message || (err as NodeJS.ErrnoException).code || err.name;
        this.logger.warn(`Redis error (serving from Postgres): ${detail}`);
      }
    });
    this.client.on('ready', () => this.logger.log('Redis connected'));
  }

  /**
   * Cache-aside: returns the cached value if present, otherwise runs
   * `loader` (the Prisma query), caches its result and returns it.
   *
   * - `null` and `undefined` results are not cached, so "class not found" is
   *   never remembered.
   * - Values pass through JSON, so Date and Decimal come back as strings. Use
   *   this only for reads whose consumer tolerates that (transformClass
   *   wraps `schedule` in new Date() and converts prices with Number()).
   * - Logs HIT and MISS with timings.
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
      return null; // Miss. The error listener has already logged any connection issue.
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      /* Best effort. */
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (!this.client || keys.length === 0) return;
    try {
      await this.client.unlink(...keys);
    } catch {
      /* Best effort. */
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
      /* Best effort. */
    }
  }

  /**
   * For the health endpoint. Reports 'disabled' when REDIS_URL is unset (not
   * a failure) and 'down' when Redis does not answer. The offline queue is
   * off and commandTimeout is 500ms, so this fails fast instead of hanging.
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
   * Call after a write has committed (after the $transaction promise
   * resolves), never before: invalidating first would let a concurrent read
   * re-cache the old, not-yet-committed data.
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
