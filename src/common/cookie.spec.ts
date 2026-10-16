import { describe, it, expect, afterEach } from 'vitest';
import { authCookieOptions, clearAuthCookieOptions } from './cookie.js';

const saved = {
  NODE_ENV: process.env.NODE_ENV,
  COOKIE_CROSS_SITE: process.env.COOKIE_CROSS_SITE,
};

function setEnv(nodeEnv?: string, override?: string) {
  if (nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = nodeEnv;
  if (override === undefined) delete process.env.COOKIE_CROSS_SITE;
  else process.env.COOKIE_CROSS_SITE = override;
}

afterEach(() => setEnv(saved.NODE_ENV, saved.COOKIE_CROSS_SITE));

describe('auth cookie options', () => {
  it('uses lax and not secure outside production', () => {
    setEnv('development');
    const o = authCookieOptions();
    expect(o.sameSite).toBe('lax');
    expect(o.secure).toBe(false);
    expect(o.httpOnly).toBe(true);
  });

  it('uses none + secure in production', () => {
    setEnv('production');
    const o = authCookieOptions();
    expect(o.sameSite).toBe('none');
    expect(o.secure).toBe(true);
    expect(o.httpOnly).toBe(true);
  });

  it('COOKIE_CROSS_SITE overrides NODE_ENV in both directions', () => {
    setEnv('development', 'true');
    expect(authCookieOptions().sameSite).toBe('none');
    setEnv('production', 'false');
    expect(authCookieOptions().sameSite).toBe('lax');
  });

  it('clear options match the set options (minus maxAge)', () => {
    setEnv('production');
    const { maxAge, ...rest } = authCookieOptions();
    expect(maxAge).toBeGreaterThan(0);
    expect(clearAuthCookieOptions()).toEqual(rest);
  });
});
