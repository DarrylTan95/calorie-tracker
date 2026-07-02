import { describe, it, expect } from 'vitest';
import { ProfileBody, WeightBody, TargetsBody } from '@/lib/validate';

describe('ProfileBody', () => {
  const valid = {
    name: 'D', weightKg: 85, heightCm: 170, age: 31,
    gender: 'male', goal: 'fat_loss', gymDaysPerWeek: 4, experience: 'intermediate',
  };

  it('accepts a valid profile', () => {
    expect(ProfileBody.safeParse(valid).success).toBe(true);
  });

  it('rejects out-of-range and wrong-enum values', () => {
    expect(ProfileBody.safeParse({ ...valid, weightKg: 10 }).success).toBe(false);
    expect(ProfileBody.safeParse({ ...valid, goal: 'get_shredded' }).success).toBe(false);
    expect(ProfileBody.safeParse({ ...valid, gymDaysPerWeek: 8 }).success).toBe(false);
  });
});

describe('WeightBody', () => {
  it('accepts valid, rejects bad date format and range', () => {
    expect(WeightBody.safeParse({ date: '2026-07-02', weightKg: 84.5 }).success).toBe(true);
    expect(WeightBody.safeParse({ date: '02/07/2026', weightKg: 84.5 }).success).toBe(false);
    expect(WeightBody.safeParse({ date: '2026-07-02', weightKg: 500 }).success).toBe(false);
  });
});

describe('TargetsBody', () => {
  it('accepts known override keys only, and requires positive numbers', () => {
    expect(TargetsBody.safeParse({ overrides: { caloriesGym: 2100 }, effectiveFrom: '2026-07-02' }).success).toBe(true);
    expect(TargetsBody.safeParse({ overrides: { nonsense: 1 }, effectiveFrom: '2026-07-02' }).success).toBe(false);
    expect(TargetsBody.safeParse({ overrides: { protein: -5 }, effectiveFrom: '2026-07-02' }).success).toBe(false);
  });
});
