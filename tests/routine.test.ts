import { describe, it, expect } from 'vitest';
import { generateRoutine, suggestNextPerformance } from '@/lib/routine';

describe('generateRoutine', () => {
  it('cycles Full Body A/B for 2-3 days/week', () => {
    const two = generateRoutine({ goal: 'fat_loss', daysPerWeek: 2, experience: 'beginner' });
    expect(two.map((d) => d.label)).toEqual(['Full Body A', 'Full Body B']);

    const three = generateRoutine({ goal: 'fat_loss', daysPerWeek: 3, experience: 'beginner' });
    expect(three.map((d) => d.label)).toEqual(['Full Body A', 'Full Body B', 'Full Body A']);
  });

  it('uses fixed Upper/Lower A/B for 4 days/week', () => {
    const four = generateRoutine({ goal: 'maintain', daysPerWeek: 4, experience: 'intermediate' });
    expect(four.map((d) => d.label)).toEqual(['Upper A', 'Lower A', 'Upper B', 'Lower B']);
  });

  it('cycles Push/Pull/Legs for 5-7 days/week', () => {
    const five = generateRoutine({ goal: 'muscle_gain', daysPerWeek: 5, experience: 'advanced' });
    expect(five.map((d) => d.label)).toEqual(['Push', 'Pull', 'Legs', 'Push', 'Pull']);

    const seven = generateRoutine({ goal: 'muscle_gain', daysPerWeek: 7, experience: 'advanced' });
    expect(seven.map((d) => d.label)).toEqual(['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs', 'Push']);
  });

  it('sets rep ranges by goal and sets-per-exercise by experience', () => {
    const days = generateRoutine({ goal: 'muscle_gain', daysPerWeek: 4, experience: 'advanced' });
    for (const day of days) {
      for (const ex of day.exercises) {
        expect(ex.repMin).toBe(6);
        expect(ex.repMax).toBe(10);
        expect(ex.sets).toBe(5);
      }
    }
  });

  it('produces the expected exercise list for Full Body A', () => {
    const [dayA] = generateRoutine({ goal: 'fat_loss', daysPerWeek: 1, experience: 'beginner' });
    expect(dayA.label).toBe('Full Body A');
    expect(dayA.exercises.map((e) => e.name)).toEqual([
      'Barbell Squat', 'Bench Press', 'Bent-Over Row', 'Overhead Press', 'Plank',
    ]);
    expect(dayA.exercises.every((e) => e.sets === 3 && e.repMin === 10 && e.repMax === 15)).toBe(true);
  });
});

describe('suggestNextPerformance', () => {
  it('returns null when there is no prior performance', () => {
    expect(suggestNextPerformance(null, 8, 12)).toBeNull();
    expect(suggestNextPerformance([], 8, 12)).toBeNull();
  });

  it('suggests +2.5kg and the bottom of the rep range when all sets hit the top last time', () => {
    const lastSets = [{ reps: 12, weightKg: 50 }, { reps: 12, weightKg: 50 }, { reps: 12, weightKg: 50 }];
    expect(suggestNextPerformance(lastSets, 8, 12)).toEqual({ weightKg: 52.5, reps: 8 });
  });

  it('suggests the same weight and the top of the rep range when not all sets hit the top', () => {
    const lastSets = [{ reps: 10, weightKg: 50 }, { reps: 9, weightKg: 50 }, { reps: 8, weightKg: 50 }];
    expect(suggestNextPerformance(lastSets, 8, 12)).toEqual({ weightKg: 50, reps: 12 });
  });
});
