import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers/db';
import {
  saveProfile, searchFoodItems, getFavoriteFoodItems, getRecentFoodItems,
  createFoodItem, setFoodItemFavorite, getDiaryEntries, addDiaryEntry,
  deleteDiaryEntry, getDayLog, upsertDayLog, type DB,
} from '@/db/queries';

const BASE_PROFILE = {
  name: 'Darryl', weightKg: 85, heightCm: 170, age: 31,
  gender: 'male' as const, goal: 'fat_loss' as const,
  gymDaysPerWeek: 4, experience: 'intermediate' as const,
};

let db: DB;
beforeEach(async () => { db = await createTestDb(); });

describe('food items', () => {
  it('creates a custom item as isCustom, not favorite', async () => {
    const item = await createFoodItem(db, {
      name: 'Chicken Rice', portionLabel: '1 plate', kcal: 600, protein: 35, carbs: 70, fat: 18,
    });
    expect(item.isCustom).toBe(true);
    expect(item.isFavorite).toBe(false);
    expect(item.id).toBeTypeOf('number');
  });

  it('searches case-insensitively by substring, favorites first', async () => {
    await createFoodItem(db, { name: 'Chicken Rice', portionLabel: '1 plate', kcal: 600, protein: 35, carbs: 70, fat: 18 });
    const bee = await createFoodItem(db, { name: 'Chicken Chop', portionLabel: '1 plate', kcal: 700, protein: 40, carbs: 50, fat: 30 });
    await setFoodItemFavorite(db, bee.id, true);

    const results = await searchFoodItems(db, 'chicken');
    expect(results.map((r) => r.name)).toEqual(['Chicken Chop', 'Chicken Rice']);
  });

  it('returns empty array for blank query without querying the db', async () => {
    expect(await searchFoodItems(db, '   ')).toEqual([]);
  });

  it('returns favorites ordered by name', async () => {
    const a = await createFoodItem(db, { name: 'Zebra Bar', portionLabel: '1 bar', kcal: 200, protein: 10, carbs: 20, fat: 5 });
    const b = await createFoodItem(db, { name: 'Apple', portionLabel: '1 medium', kcal: 95, protein: 0, carbs: 25, fat: 0 });
    await setFoodItemFavorite(db, a.id, true);
    await setFoodItemFavorite(db, b.id, true);
    const favs = await getFavoriteFoodItems(db);
    expect(favs.map((f) => f.name)).toEqual(['Apple', 'Zebra Bar']);
  });

  it('returns recent items most-recently-logged first, deduped', async () => {
    await saveProfile(db, BASE_PROFILE);
    const rice = await createFoodItem(db, { name: 'Chicken Rice', portionLabel: '1 plate', kcal: 600, protein: 35, carbs: 70, fat: 18 });
    const kopi = await createFoodItem(db, { name: 'Kopi O', portionLabel: '1 cup', kcal: 20, protein: 0, carbs: 5, fat: 0 });
    await addDiaryEntry(db, {
      date: '2026-07-01', mealSlot: 'lunch', foodItemId: rice.id, name: rice.name,
      portionMultiplier: 1, calories: 600, protein: 35, carbs: 70, fat: 18,
    });
    await addDiaryEntry(db, {
      date: '2026-07-02', mealSlot: 'breakfast', foodItemId: kopi.id, name: kopi.name,
      portionMultiplier: 1, calories: 20, protein: 0, carbs: 5, fat: 0,
    });
    // Log rice again on a later date — it should move to the front, appearing once.
    await addDiaryEntry(db, {
      date: '2026-07-02', mealSlot: 'lunch', foodItemId: rice.id, name: rice.name,
      portionMultiplier: 1, calories: 600, protein: 35, carbs: 70, fat: 18,
    });
    const recent = await getRecentFoodItems(db);
    expect(recent.map((r) => r.name)).toEqual(['Chicken Rice', 'Kopi O']);
  });
});

describe('diary entries', () => {
  it('adds and retrieves entries for a date, ordered by log order', async () => {
    await addDiaryEntry(db, {
      date: '2026-07-02', mealSlot: 'breakfast', foodItemId: null, name: 'Oats',
      portionMultiplier: 1, calories: 300, protein: 10, carbs: 50, fat: 5,
    });
    await addDiaryEntry(db, {
      date: '2026-07-02', mealSlot: 'lunch', foodItemId: null, name: 'Chicken Rice',
      portionMultiplier: 1.5, calories: 900, protein: 52, carbs: 105, fat: 27,
    });
    await addDiaryEntry(db, {
      date: '2026-07-03', mealSlot: 'breakfast', foodItemId: null, name: 'Toast',
      portionMultiplier: 1, calories: 200, protein: 6, carbs: 30, fat: 4,
    });

    const entries = await getDiaryEntries(db, '2026-07-02');
    expect(entries.map((e) => e.name)).toEqual(['Oats', 'Chicken Rice']);
    expect(entries[1].portionMultiplier).toBe(1.5);
  });

  it('deletes an entry', async () => {
    const created = await addDiaryEntry(db, {
      date: '2026-07-02', mealSlot: 'snacks', foodItemId: null, name: 'Protein Bar',
      portionMultiplier: 1, calories: 200, protein: 20, carbs: 15, fat: 6,
    });
    await deleteDiaryEntry(db, created.id);
    expect(await getDiaryEntries(db, '2026-07-02')).toEqual([]);
  });
});

describe('day log', () => {
  it('returns defaults when no row exists yet', async () => {
    expect(await getDayLog(db, '2026-07-02')).toEqual({ date: '2026-07-02', waterL: 0, isGymDay: true });
  });

  it('upserts partial patches without clobbering the other field', async () => {
    await upsertDayLog(db, '2026-07-02', { waterL: 1.5 });
    await upsertDayLog(db, '2026-07-02', { isGymDay: false });
    expect(await getDayLog(db, '2026-07-02')).toEqual({ date: '2026-07-02', waterL: 1.5, isGymDay: false });
  });
});
