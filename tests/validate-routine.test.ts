import { describe, it, expect } from 'vitest';
import { GenerateRoutineBody, LogWorkoutBody } from '@/lib/validate';

describe('GenerateRoutineBody', () => {
  const valid = { goal: 'fat_loss', daysPerWeek: 4, experience: 'intermediate' };
  it('accepts a valid body', () => expect(GenerateRoutineBody.safeParse(valid).success).toBe(true));
  it('rejects an out-of-range daysPerWeek and invalid enum', () => {
    expect(GenerateRoutineBody.safeParse({ ...valid, daysPerWeek: 0 }).success).toBe(false);
    expect(GenerateRoutineBody.safeParse({ ...valid, daysPerWeek: 8 }).success).toBe(false);
    expect(GenerateRoutineBody.safeParse({ ...valid, goal: 'get_shredded' }).success).toBe(false);
  });
});

describe('LogWorkoutBody', () => {
  const valid = {
    date: '2026-07-02',
    routineDayLabel: 'Full Body A',
    sets: [{ exerciseName: 'Barbell Squat', setNumber: 1, reps: 10, weightKg: 60 }],
  };
  it('accepts a valid body with and without notes', () => {
    expect(LogWorkoutBody.safeParse(valid).success).toBe(true);
    expect(LogWorkoutBody.safeParse({ ...valid, notes: 'felt strong' }).success).toBe(true);
  });
  it('rejects an empty sets array and out-of-range values', () => {
    expect(LogWorkoutBody.safeParse({ ...valid, sets: [] }).success).toBe(false);
    expect(LogWorkoutBody.safeParse({ ...valid, sets: [{ ...valid.sets[0], weightKg: -5 }] }).success).toBe(false);
  });
});
