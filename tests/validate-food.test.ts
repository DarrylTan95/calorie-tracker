import { describe, it, expect } from 'vitest';
import { CreateFoodItemBody, AddDiaryEntryBody, SetFavoriteBody, DayLogPatchBody } from '@/lib/validate';

describe('CreateFoodItemBody', () => {
  const valid = { name: 'Chicken Rice', portionLabel: '1 plate', kcal: 600, protein: 35, carbs: 70, fat: 18 };
  it('accepts a valid item', () => expect(CreateFoodItemBody.safeParse(valid).success).toBe(true));
  it('rejects empty name and out-of-range macros', () => {
    expect(CreateFoodItemBody.safeParse({ ...valid, name: '' }).success).toBe(false);
    expect(CreateFoodItemBody.safeParse({ ...valid, kcal: 9999 }).success).toBe(false);
    expect(CreateFoodItemBody.safeParse({ ...valid, protein: -1 }).success).toBe(false);
  });
});

describe('AddDiaryEntryBody', () => {
  const valid = {
    date: '2026-07-02', mealSlot: 'lunch', foodItemId: 1, name: 'Chicken Rice',
    portionMultiplier: 1, calories: 600, protein: 35, carbs: 70, fat: 18,
  };
  it('accepts a valid entry with a food item id', () => expect(AddDiaryEntryBody.safeParse(valid).success).toBe(true));
  it('accepts a null food item id for manual entries', () => {
    expect(AddDiaryEntryBody.safeParse({ ...valid, foodItemId: null }).success).toBe(true);
  });
  it('rejects an invalid meal slot and out-of-range portion multiplier', () => {
    expect(AddDiaryEntryBody.safeParse({ ...valid, mealSlot: 'brunch' }).success).toBe(false);
    expect(AddDiaryEntryBody.safeParse({ ...valid, portionMultiplier: 0 }).success).toBe(false);
    expect(AddDiaryEntryBody.safeParse({ ...valid, portionMultiplier: 20 }).success).toBe(false);
  });
});

describe('SetFavoriteBody', () => {
  it('accepts a boolean and rejects non-booleans', () => {
    expect(SetFavoriteBody.safeParse({ isFavorite: true }).success).toBe(true);
    expect(SetFavoriteBody.safeParse({ isFavorite: 'yes' }).success).toBe(false);
  });
});

describe('DayLogPatchBody', () => {
  it('accepts a date-only patch and a full patch', () => {
    expect(DayLogPatchBody.safeParse({ date: '2026-07-02' }).success).toBe(true);
    expect(DayLogPatchBody.safeParse({ date: '2026-07-02', waterL: 1.5, isGymDay: false }).success).toBe(true);
  });
  it('rejects water out of range', () => {
    expect(DayLogPatchBody.safeParse({ date: '2026-07-02', waterL: -1 }).success).toBe(false);
    expect(DayLogPatchBody.safeParse({ date: '2026-07-02', waterL: 20 }).success).toBe(false);
  });
});
