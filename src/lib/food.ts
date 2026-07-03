export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snacks';

export const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snacks'];

export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface DiaryEntry extends Macros {
  id: number;
  date: string;
  mealSlot: MealSlot;
  foodItemId: number | null;
  name: string;
  portionMultiplier: number;
}

export function sumEntries(entries: Macros[]): Macros {
  return entries.reduce(
    (acc, e) => ({
      calories: acc.calories + e.calories,
      protein: acc.protein + e.protein,
      carbs: acc.carbs + e.carbs,
      fat: acc.fat + e.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export function groupByMealSlot(entries: DiaryEntry[]): Record<MealSlot, DiaryEntry[]> {
  const groups: Record<MealSlot, DiaryEntry[]> = { breakfast: [], lunch: [], dinner: [], snacks: [] };
  for (const entry of entries) {
    groups[entry.mealSlot].push(entry);
  }
  return groups;
}
