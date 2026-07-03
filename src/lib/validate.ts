import { z } from 'zod';
import { OVERRIDE_KEYS } from './targets';
import { MEAL_SLOTS } from './food';

export const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

export const ProfileBody = z.object({
  name: z.string().max(100),
  weightKg: z.number().min(30).max(300),
  heightCm: z.number().min(100).max(250),
  age: z.number().int().min(10).max(120),
  gender: z.enum(['male', 'female']),
  goal: z.enum(['fat_loss', 'maintain', 'muscle_gain']),
  gymDaysPerWeek: z.number().int().min(1).max(7),
  experience: z.enum(['beginner', 'intermediate', 'advanced']),
});

export const WeightBody = z.object({
  date: DateString,
  weightKg: z.number().min(30).max(300),
});

// Built as a strict object (not z.record) so unknown keys are rejected
// consistently across zod versions.
const overrideShape = Object.fromEntries(
  OVERRIDE_KEYS.map((k) => [k, z.number().positive().optional()]),
);
export const TargetsBody = z.object({
  overrides: z.object(overrideShape).strict(),
  effectiveFrom: DateString,
});

export const CreateFoodItemBody = z.object({
  name: z.string().min(1).max(100),
  portionLabel: z.string().min(1).max(50),
  kcal: z.number().min(0).max(5000),
  protein: z.number().min(0).max(500),
  carbs: z.number().min(0).max(500),
  fat: z.number().min(0).max(500),
});

export const AddDiaryEntryBody = z.object({
  date: DateString,
  mealSlot: z.enum(MEAL_SLOTS as [string, ...string[]]),
  foodItemId: z.number().int().positive().nullable(),
  name: z.string().min(1).max(100),
  portionMultiplier: z.number().min(0.1).max(10),
  calories: z.number().min(0).max(5000),
  protein: z.number().min(0).max(500),
  carbs: z.number().min(0).max(500),
  fat: z.number().min(0).max(500),
});

export const SetFavoriteBody = z.object({
  isFavorite: z.boolean(),
});

export const DayLogPatchBody = z.object({
  date: DateString,
  waterL: z.number().min(0).max(10).optional(),
  isGymDay: z.boolean().optional(),
});
