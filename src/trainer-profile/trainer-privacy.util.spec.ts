import { describe, it, expect } from 'vitest';
import { forViewer } from './trainer-privacy.util.js';

const profile = { id: '1', phone: '0800', bio: 'hi', dateOfBirth: new Date('1990-01-01') };

describe('forViewer', () => {
  it('admin sees everything', () => {
    expect(forViewer(profile, 'admin')).toEqual(profile);
  });
  it('members and trainers do not get the date of birth, but keep the rest', () => {
    for (const role of ['member', 'trainer']) {
      const out = forViewer(profile, role);
      expect('dateOfBirth' in out).toBe(false);
      expect(out.phone).toBe('0800');
      expect(out.bio).toBe('hi');
    }
  });
});
