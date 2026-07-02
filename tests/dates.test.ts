import { describe, it, expect } from 'vitest';
import { todayLocalISO } from '@/lib/dates';

describe('todayLocalISO', () => {
  it('returns YYYY-MM-DD', () => {
    expect(todayLocalISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('uses local time, not UTC', () => {
    // Construct from a known Date: 2026-07-02T01:00 local
    expect(todayLocalISO(new Date(2026, 6, 2, 1, 0))).toBe('2026-07-02');
  });
});
