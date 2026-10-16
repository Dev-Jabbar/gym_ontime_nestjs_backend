import { describe, it, expect } from 'vitest';
import { findEnvProblems } from './env.validation.js';

const good = {
  DATABASE_URL: 'postgresql://x',
  PAYSTACK_SECRET_KEY: 'k',
  JWT_SECRET: 'a'.repeat(40),
  FRONTEND_URL: 'https://site.com',
  REDIS_URL: 'redis://x',
  CLOUDINARY_CLOUD_NAME: 'c',
  CLOUDINARY_API_KEY: 'k',
  CLOUDINARY_API_SECRET: 's',
} as NodeJS.ProcessEnv;

describe('findEnvProblems', () => {
  it('is clean with a complete production setup', () => {
    const r = findEnvProblems({ ...good, NODE_ENV: 'production' });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('errors when DATABASE_URL or PAYSTACK_SECRET_KEY is missing', () => {
    const r = findEnvProblems({ ...good, DATABASE_URL: '', PAYSTACK_SECRET_KEY: undefined });
    expect(r.errors).toHaveLength(2);
  });

  it('JWT_SECRET: warning in dev, error in production', () => {
    const dev = findEnvProblems({ ...good, JWT_SECRET: undefined });
    expect(dev.errors).toEqual([]);
    expect(dev.warnings.some((w) => w.includes('JWT_SECRET'))).toBe(true);
    const prod = findEnvProblems({ ...good, JWT_SECRET: undefined, NODE_ENV: 'production' });
    expect(prod.errors.some((e) => e.includes('JWT_SECRET'))).toBe(true);
  });

  it('rejects a short JWT_SECRET in production only', () => {
    const short = { ...good, JWT_SECRET: 'abc' };
    expect(findEnvProblems({ ...short, NODE_ENV: 'production' }).errors).toHaveLength(1);
    expect(findEnvProblems(short).errors).toEqual([]);
  });

  it('requires FRONTEND_URL in production, warns about non-https', () => {
    expect(
      findEnvProblems({ ...good, FRONTEND_URL: '', NODE_ENV: 'production' }).errors,
    ).toHaveLength(1);
    const r = findEnvProblems({ ...good, FRONTEND_URL: 'http://x.com', NODE_ENV: 'production' });
    expect(r.errors).toEqual([]);
    expect(r.warnings.some((w) => w.includes('https'))).toBe(true);
  });

  it('only warns (does not block) when Redis or Cloudinary are missing', () => {
    const r = findEnvProblems({ ...good, REDIS_URL: undefined, CLOUDINARY_API_KEY: undefined });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toHaveLength(2);
  });

  it('warns when rate limiting is disabled in production', () => {
    const r = findEnvProblems({ ...good, NODE_ENV: 'production', THROTTLE_DISABLED: 'true' });
    expect(r.warnings.some((w) => w.includes('THROTTLE_DISABLED'))).toBe(true);
  });
});
