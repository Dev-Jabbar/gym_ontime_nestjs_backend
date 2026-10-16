import { describe, it, expect } from 'vitest';
import { redactTrainerPhone, redactTrainerPhones } from './class-privacy.util.js';

const cls = { id: '1', trainer: { name: 'T', phone: '0800' } };

describe('redactTrainerPhone', () => {
  it('blanks the phone without changing other fields or mutating the input', () => {
    const out = redactTrainerPhone(cls);
    expect(out.trainer.phone).toBeNull();
    expect(out.trainer.name).toBe('T');
    expect(cls.trainer.phone).toBe('0800');
  });

  it('handles a missing trainer and works on lists', () => {
    expect(redactTrainerPhone({ id: '2' } as any)).toEqual({ id: '2' });
    expect(redactTrainerPhones([cls])[0].trainer.phone).toBeNull();
  });
});
