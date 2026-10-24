import { describe, it, expect } from 'vitest';
import { swaggerEnabled } from './swagger.js';

describe('swaggerEnabled', () => {
  it('is on by default', () => {
    expect(swaggerEnabled({})).toBe(true);
    expect(swaggerEnabled({ SWAGGER_ENABLED: '' })).toBe(true);
    expect(swaggerEnabled({ SWAGGER_ENABLED: 'true' })).toBe(true);
  });

  it('can be switched off, whatever the spelling', () => {
    expect(swaggerEnabled({ SWAGGER_ENABLED: 'false' })).toBe(false);
    expect(swaggerEnabled({ SWAGGER_ENABLED: ' FALSE ' })).toBe(false);
    expect(swaggerEnabled({ SWAGGER_ENABLED: '0' })).toBe(false);
    expect(swaggerEnabled({ SWAGGER_ENABLED: 'off' })).toBe(false);
  });
});
