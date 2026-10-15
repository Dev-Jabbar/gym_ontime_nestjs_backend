import { describe, it, expect } from 'vitest';
import { HealthService } from './health.service.js';
import type { HealthRepository } from './health.repository.js';
import type { CacheService } from '../cache/cache.service.js';

// Plain fakes, no Nest DI container: fast and needs no Postgres or Redis.
const repo = (ping: () => Promise<void>) =>
  ({ pingDatabase: ping }) as unknown as HealthRepository;
const cache = (ping: () => Promise<'up' | 'down' | 'disabled'>) =>
  ({ ping }) as unknown as CacheService;

describe('HealthService', () => {
  it('is ok when database and redis are up', async () => {
    const svc = new HealthService(
      repo(async () => {}),
      cache(async () => 'up'),
    );
    const r = await svc.check();
    expect(r.status).toBe('ok');
    expect(r.checks.database.status).toBe('up');
    expect(r.checks.redis.status).toBe('up');
  });

  it('is ok when redis is disabled (no REDIS_URL is not a failure)', async () => {
    const svc = new HealthService(
      repo(async () => {}),
      cache(async () => 'disabled'),
    );
    expect((await svc.check()).status).toBe('ok');
  });

  it('is degraded (not error) when only redis is down', async () => {
    const svc = new HealthService(
      repo(async () => {}),
      cache(async () => 'down'),
    );
    const r = await svc.check();
    expect(r.status).toBe('degraded');
    expect(r.checks.redis.status).toBe('down');
  });

  it('is error when the database is down', async () => {
    const svc = new HealthService(
      repo(async () => {
        throw new Error('connection refused');
      }),
      cache(async () => 'up'),
    );
    const r = await svc.check();
    expect(r.status).toBe('error');
    expect(r.checks.database.status).toBe('down');
  });

  it('treats a throwing redis ping as down', async () => {
    const svc = new HealthService(
      repo(async () => {}),
      cache(async () => {
        throw new Error('boom');
      }),
    );
    expect((await svc.check()).checks.redis.status).toBe('down');
  });

  it('does not leak error messages in the report', async () => {
    const svc = new HealthService(
      repo(async () => {
        throw new Error('postgres://user:secret@host/db');
      }),
      cache(async () => 'up'),
    );
    expect(JSON.stringify(await svc.check())).not.toContain('secret');
  });
});
