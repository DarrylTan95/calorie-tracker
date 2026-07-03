import { describe, it, expect } from 'vitest';
import { todayLocalISO, addDaysISO } from '@/lib/dates';

describe('todayLocalISO', () => {
  it('returns YYYY-MM-DD', () => {
    expect(todayLocalISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('uses local time, not UTC', () => {
    // Construct from a known Date: 2026-07-02T01:00 local
    expect(todayLocalISO(new Date(2026, 6, 2, 1, 0))).toBe('2026-07-02');
  });
});

describe('addDaysISO', () => {
  it('adds and subtracts days without a UTC-parsing shift', () => {
    expect(addDaysISO('2026-07-03', -6)).toBe('2026-06-27');
    expect(addDaysISO('2026-07-03', 0)).toBe('2026-07-03');
  });

  it('rolls over month and year boundaries correctly', () => {
    expect(addDaysISO('2026-01-03', -5)).toBe('2025-12-29');
  });
});
