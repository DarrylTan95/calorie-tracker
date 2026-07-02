import { z } from 'zod';
import { OVERRIDE_KEYS } from './targets';

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
