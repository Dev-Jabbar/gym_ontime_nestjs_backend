import { describe, it, expect } from 'vitest';
import { parseOrigins } from './cors.js';

describe('parseOrigins', () => {
  it('falls back to the built-in list when CORS_ORIGINS is unset', () => {
    const o = parseOrigins({});
    expect(o).toContain('http://localhost:4000');
    expect(o).toContain('https://gym-ontime.vercel.app');
  });

  it('uses CORS_ORIGINS, trimming spaces and trailing slashes', () => {
    const o = parseOrigins({
      CORS_ORIGINS: ' https://a.com/ , https://b.com ,, ',
    });
    expect(o).toEqual(['https://a.com', 'https://b.com']);
  });

  it('always adds FRONTEND_URL, without duplicates', () => {
    const o = parseOrigins({
      CORS_ORIGINS: 'https://a.com',
      FRONTEND_URL: 'https://a.com/',
    });
    expect(o).toEqual(['https://a.com']);
    const o2 = parseOrigins({
      CORS_ORIGINS: 'https://a.com',
      FRONTEND_URL: 'https://front.com',
    });
    expect(o2).toEqual(['https://a.com', 'https://front.com']);
  });
});
