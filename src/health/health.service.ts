import { Injectable } from '@nestjs/common';
import { CacheService } from '../cache/cache.service.js';
import { HealthRepository } from './health.repository.js';

export type CheckStatus = 'up' | 'down' | 'disabled';

export interface CheckResult {
  status: CheckStatus;
  latencyMs: number;
}

export interface HealthReport {
  // ok       = everything works
  // degraded = database works but Redis is down (the API still serves
  //            traffic: cache and queue fail open), so do NOT restart
  // error    = database is down, the API cannot do its job
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  uptimeSeconds: number;
  checks: { database: CheckResult; redis: CheckResult };
}

// A hung dependency must never hang the health endpoint (the platform that
// calls it would treat a slow answer as a failure anyway). Generous enough
// for a cold Neon wake-up.
const DB_TIMEOUT_MS = 5000;
const REDIS_TIMEOUT_MS = 1500;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

@Injectable()
export class HealthService {
  constructor(
    private readonly repository: HealthRepository,
    private readonly cache: CacheService,
  ) {}

  async check(): Promise<HealthReport> {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const status =
      database.status === 'down'
        ? 'error'
        : redis.status === 'down'
          ? 'degraded'
          : 'ok';

    return {
      status,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      checks: { database, redis },
    };
  }

  private async checkDatabase(): Promise<CheckResult> {
    const t0 = performance.now();
    try {
      await withTimeout(this.repository.pingDatabase(), DB_TIMEOUT_MS);
      return { status: 'up', latencyMs: Math.round(performance.now() - t0) };
    } catch {
      return { status: 'down', latencyMs: Math.round(performance.now() - t0) };
    }
  }

  private async checkRedis(): Promise<CheckResult> {
    const t0 = performance.now();
    try {
      const status = await withTimeout(this.cache.ping(), REDIS_TIMEOUT_MS);
      return { status, latencyMs: Math.round(performance.now() - t0) };
    } catch {
      return { status: 'down', latencyMs: Math.round(performance.now() - t0) };
    }
  }
}
