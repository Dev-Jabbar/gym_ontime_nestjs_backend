import { describe, it, expect } from 'vitest';
import { isPastOneOffClass } from './class-timing.util.js';

const now = new Date('2026-10-15T12:00:00Z');

describe('isPastOneOffClass', () => {
  it('is true for a one-off class that already started', () => {
    expect(isPastOneOffClass({ recurrence: 'none', schedule: '2026-10-02T09:00:00Z' }, now)).toBe(true);
    expect(isPastOneOffClass({ recurrence: null, schedule: new Date('2026-10-15T11:59:00Z') }, now)).toBe(true);
  });

  it('is false for a one-off class in the future', () => {
    expect(isPastOneOffClass({ recurrence: 'none', schedule: '2026-10-15T12:01:00Z' }, now)).toBe(false);
  });

  it('is false for recurring classes even if the first date is long gone', () => {
    expect(isPastOneOffClass({ recurrence: 'weekly', schedule: '2026-01-05T09:00:00Z' }, now)).toBe(false);
    expect(isPastOneOffClass({ recurrence: 'daily', schedule: '2026-01-05T09:00:00Z' }, now)).toBe(false);
  });
});
