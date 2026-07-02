import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers/db';
import {
  getProfile, saveProfile, logWeight, getWeightLog, getOverrides, saveOverrides, type DB,
} from '@/db/queries';

const BASE_PROFILE = {
  name: 'Darryl', weightKg: 85, heightCm: 170, age: 31,
  gender: 'male' as const, goal: 'fat_loss' as const,
  gymDaysPerWeek: 4, experience: 'intermediate' as const,
};

let db: DB;
beforeEach(async () => { db = await createTestDb(); });

describe('profile', () => {
  it('returns null before any save', async () => {
    expect(await getProfile(db)).toBeNull();
  });

  it('saves then updates the single profile row', async () => {
    await saveProfile(db, BASE_PROFILE);
    await saveProfile(db, { ...BASE_PROFILE, weightKg: 84 });
    const p = await getProfile(db);
    expect(p?.id).toBe(1);
    expect(p?.weightKg).toBe(84);
  });
});

describe('weight log', () => {
  it('upserts by date, returns descending, and updates profile weight', async () => {
    await saveProfile(db, BASE_PROFILE);
    await logWeight(db, { date: '2026-07-01', weightKg: 85.2 });
    await logWeight(db, { date: '2026-07-02', weightKg: 84.8 });
    await logWeight(db, { date: '2026-07-02', weightKg: 84.6 }); // same-day correction
    const log = await getWeightLog(db);
    expect(log).toEqual([
      { date: '2026-07-02', weightKg: 84.6 },
      { date: '2026-07-01', weightKg: 85.2 },
    ]);
    expect((await getProfile(db))?.weightKg).toBe(84.6);
  });
});

describe('overrides', () => {
  it('returns empty overrides when none saved', async () => {
    expect(await getOverrides(db)).toEqual({});
  });

  it('returns latest saved overrides', async () => {
    await saveProfile(db, BASE_PROFILE);
    await saveOverrides(db, { caloriesGym: 2100 }, '2026-07-01');
    await saveOverrides(db, { caloriesGym: 2000, protein: 180 }, '2026-07-02');
    expect(await getOverrides(db)).toEqual({ caloriesGym: 2000, protein: 180 });
  });
});
