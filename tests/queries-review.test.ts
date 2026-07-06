import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers/db';
import {
  saveProfile, addDiaryEntry, getDiaryEntriesRange, upsertDayLog, getDayLogsRange,
  createWorkoutSession, getWorkoutSessionsRange,
  createWeeklyReview, getLatestWeeklyReview, applyWeeklyReviewRecommendation, getOverrides,
  type DB,
} from '@/db/queries';

const BASE_PROFILE = {
  name: 'Darryl', weightKg: 85, heightCm: 170, age: 31,
  gender: 'male' as const, goal: 'fat_loss' as const,
  gymDaysPerWeek: 4, experience: 'intermediate' as const,
};

let db: DB;
beforeEach(async () => { db = await createTestDb(); });

describe('date-range queries', () => {
  it('returns diary entries within an inclusive date range, ordered by date', async () => {
    await addDiaryEntry(db, { date: '2026-06-28', mealSlot: 'lunch', foodItemId: null, name: 'A', portionMultiplier: 1, calories: 500, protein: 30, carbs: 50, fat: 10 });
    await addDiaryEntry(db, { date: '2026-07-01', mealSlot: 'lunch', foodItemId: null, name: 'B', portionMultiplier: 1, calories: 600, protein: 35, carbs: 60, fat: 15 });
    await addDiaryEntry(db, { date: '2026-07-05', mealSlot: 'lunch', foodItemId: null, name: 'C', portionMultiplier: 1, calories: 700, protein: 40, carbs: 70, fat: 20 });

    const entries = await getDiaryEntriesRange(db, '2026-06-29', '2026-07-01');
    expect(entries.map((e) => e.name)).toEqual(['B']);
  });

  it('returns day logs within an inclusive date range', async () => {
    await upsertDayLog(db, '2026-06-30', { waterL: 1 });
    await upsertDayLog(db, '2026-07-01', { waterL: 2 });
    const logs = await getDayLogsRange(db, '2026-07-01', '2026-07-02');
    expect(logs.map((l) => l.date)).toEqual(['2026-07-01']);
  });

  it('returns workout sessions within an inclusive date range', async () => {
    await createWorkoutSession(db, { date: '2026-06-30', routineDayLabel: 'A' });
    await createWorkoutSession(db, { date: '2026-07-01', routineDayLabel: 'B' });
    await createWorkoutSession(db, { date: '2026-07-03', routineDayLabel: 'A' });
    const sessions = await getWorkoutSessionsRange(db, '2026-07-01', '2026-07-02');
    expect(sessions.map((s) => s.routineDayLabel)).toEqual(['B']);
  });
});

describe('weekly reviews', () => {
  const RECOMMENDATION = { type: 'on_track' as const, message: 'On track', calorieAdjustment: null };

  it('returns null before any review exists', async () => {
    expect(await getLatestWeeklyReview(db)).toBeNull();
  });

  it('creates and retrieves the latest weekly review', async () => {
    await createWeeklyReview(db, {
      weekStart: '2026-06-22', weightTrendPercent: -0.5, calorieAdherencePercent: 90,
      proteinAdherencePercent: 85, workoutsCompleted: 3, workoutsPlanned: 4, recommendation: RECOMMENDATION, narrative: null,
    });
    await createWeeklyReview(db, {
      weekStart: '2026-06-29', weightTrendPercent: -0.3, calorieAdherencePercent: 95,
      proteinAdherencePercent: 90, workoutsCompleted: 4, workoutsPlanned: 4, recommendation: RECOMMENDATION, narrative: null,
    });
    const latest = await getLatestWeeklyReview(db);
    expect(latest?.weekStart).toBe('2026-06-29');
    expect(latest?.applied).toBe(false);
  });

  it('marks a review applied without touching targets when calorieAdjustment is null', async () => {
    await saveProfile(db, BASE_PROFILE);
    const review = await createWeeklyReview(db, {
      weekStart: '2026-06-29', weightTrendPercent: 0, calorieAdherencePercent: 90,
      proteinAdherencePercent: 90, workoutsCompleted: 4, workoutsPlanned: 4, recommendation: RECOMMENDATION, narrative: null,
    });
    await applyWeeklyReviewRecommendation(db, review.id, '2026-07-06');
    expect((await getLatestWeeklyReview(db))?.applied).toBe(true);
    expect(await getOverrides(db)).toEqual({});
  });

  it('applies a calorie adjustment on top of current effective targets', async () => {
    await saveProfile(db, BASE_PROFILE);
    const review = await createWeeklyReview(db, {
      weekStart: '2026-06-29', weightTrendPercent: -0.1, calorieAdherencePercent: 90,
      proteinAdherencePercent: 90, workoutsCompleted: 4, workoutsPlanned: 4,
      recommendation: { type: 'decrease_calories', message: 'Cut a bit', calorieAdjustment: -125 }, narrative: null,
    });
    await applyWeeklyReviewRecommendation(db, review.id, '2026-07-06');
    const overrides = await getOverrides(db);
    // fat_loss @ 85kg: caloriesGym 1947, caloriesRest 1649 (see tests/targets.test.ts), minus 125
    expect(overrides.caloriesGym).toBe(1947 - 125);
    expect(overrides.caloriesRest).toBe(1649 - 125);
  });

  it('throws when applying a recommendation before a profile exists', async () => {
    const review = await createWeeklyReview(db, {
      weekStart: '2026-06-29', weightTrendPercent: -0.1, calorieAdherencePercent: 90,
      proteinAdherencePercent: 90, workoutsCompleted: 4, workoutsPlanned: 4,
      recommendation: { type: 'decrease_calories', message: 'Cut a bit', calorieAdjustment: -125 }, narrative: null,
    });
    await expect(applyWeeklyReviewRecommendation(db, review.id, '2026-07-06')).rejects.toThrow();
  });
});
