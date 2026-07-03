import { describe, it, expect } from 'vitest';
import { sumEntries, groupByMealSlot, MEAL_SLOTS, type DiaryEntry } from '@/lib/food';

const entry = (over: Partial<DiaryEntry>): DiaryEntry => ({
  id: 1, date: '2026-07-02', mealSlot: 'lunch', foodItemId: null,
  name: 'Test', portionMultiplier: 1, calories: 0, protein: 0, carbs: 0, fat: 0,
  ...over,
});

describe('sumEntries', () => {
  it('sums macros across entries', () => {
    const entries = [
      { calories: 500, protein: 30, carbs: 60, fat: 15 },
      { calories: 250, protein: 10, carbs: 20, fat: 8 },
    ];
    expect(sumEntries(entries)).toEqual({ calories: 750, protein: 40, carbs: 80, fat: 23 });
  });

  it('returns all zeros for an empty list', () => {
    expect(sumEntries([])).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  });

  it('preserves fractional values without rounding', () => {
    const entries = [{ calories: 100.5, protein: 5.25, carbs: 10.1, fat: 2.3 }];
    expect(sumEntries(entries)).toEqual({ calories: 100.5, protein: 5.25, carbs: 10.1, fat: 2.3 });
  });
});

describe('groupByMealSlot', () => {
  it('groups entries under all four slots, preserving order within a slot', () => {
    const entries = [
      entry({ id: 1, mealSlot: 'breakfast', name: 'Oats' }),
      entry({ id: 2, mealSlot: 'lunch', name: 'Chicken Rice' }),
      entry({ id: 3, mealSlot: 'lunch', name: 'Kopi O' }),
    ];
    const grouped = groupByMealSlot(entries);
    expect(Object.keys(grouped).sort()).toEqual(['breakfast', 'dinner', 'lunch', 'snacks'].sort());
    expect(grouped.breakfast.map((e) => e.name)).toEqual(['Oats']);
    expect(grouped.lunch.map((e) => e.name)).toEqual(['Chicken Rice', 'Kopi O']);
    expect(grouped.dinner).toEqual([]);
    expect(grouped.snacks).toEqual([]);
  });

  it('returns all-empty groups for an empty list', () => {
    const grouped = groupByMealSlot([]);
    for (const slot of MEAL_SLOTS) {
      expect(grouped[slot]).toEqual([]);
    }
  });
});
