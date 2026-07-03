import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers/db';
import {
  createRoutine, getActiveRoutine, advanceRoutineDay,
  createWorkoutSession, addSetLogs, getLastSetsForExercise, type DB,
} from '@/db/queries';
import type { RoutineDay } from '@/lib/routine';

const SAMPLE_DAYS: RoutineDay[] = [
  { label: 'Full Body A', exercises: [{ name: 'Barbell Squat', sets: 3, repMin: 8, repMax: 12 }] },
  { label: 'Full Body B', exercises: [{ name: 'Deadlift', sets: 3, repMin: 8, repMax: 12 }] },
];

let db: DB;
beforeEach(async () => { db = await createTestDb(); });

describe('routines', () => {
  it('returns null before any routine exists', async () => {
    expect(await getActiveRoutine(db)).toBeNull();
  });

  it('creates an active routine with currentDayIndex 0', async () => {
    const routine = await createRoutine(db, { goal: 'fat_loss', daysPerWeek: 2, experience: 'beginner', days: SAMPLE_DAYS });
    expect(routine.isActive).toBe(true);
    expect(routine.currentDayIndex).toBe(0);
    expect(routine.days).toEqual(SAMPLE_DAYS);
  });

  it('archives the previous active routine when a new one is created', async () => {
    const first = await createRoutine(db, { goal: 'fat_loss', daysPerWeek: 2, experience: 'beginner', days: SAMPLE_DAYS });
    const second = await createRoutine(db, { goal: 'muscle_gain', daysPerWeek: 4, experience: 'advanced', days: SAMPLE_DAYS });
    const active = await getActiveRoutine(db);
    expect(active?.id).toBe(second.id);
    expect(active?.goal).toBe('muscle_gain');
    expect(first.id).not.toBe(second.id);
  });

  it('advances the current day index and wraps around', async () => {
    const routine = await createRoutine(db, { goal: 'fat_loss', daysPerWeek: 2, experience: 'beginner', days: SAMPLE_DAYS });
    await advanceRoutineDay(db, routine.id);
    expect((await getActiveRoutine(db))?.currentDayIndex).toBe(1);
    await advanceRoutineDay(db, routine.id);
    expect((await getActiveRoutine(db))?.currentDayIndex).toBe(0);
  });
});

describe('workout sessions and set logs', () => {
  it('returns null for an exercise never logged', async () => {
    expect(await getLastSetsForExercise(db, 'Bench Press')).toBeNull();
  });

  it("returns the most recent session's sets for an exercise, ordered by set number", async () => {
    const session1 = await createWorkoutSession(db, { date: '2026-07-01', routineDayLabel: 'Full Body A' });
    await addSetLogs(db, session1.id, [
      { exerciseName: 'Barbell Squat', setNumber: 1, reps: 10, weightKg: 60 },
      { exerciseName: 'Barbell Squat', setNumber: 2, reps: 9, weightKg: 60 },
    ]);
    const session2 = await createWorkoutSession(db, { date: '2026-07-03', routineDayLabel: 'Full Body A' });
    await addSetLogs(db, session2.id, [
      { exerciseName: 'Barbell Squat', setNumber: 1, reps: 12, weightKg: 62.5 },
      { exerciseName: 'Barbell Squat', setNumber: 2, reps: 12, weightKg: 62.5 },
    ]);

    const lastSets = await getLastSetsForExercise(db, 'Barbell Squat');
    expect(lastSets).toEqual([
      { reps: 12, weightKg: 62.5 },
      { reps: 12, weightKg: 62.5 },
    ]);
  });
});
