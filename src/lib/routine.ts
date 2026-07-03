import type { Goal } from './targets';

export type Experience = 'beginner' | 'intermediate' | 'advanced';

export interface RoutineExercise {
  name: string;
  sets: number;
  repMin: number;
  repMax: number;
}

export interface RoutineDay {
  label: string;
  exercises: RoutineExercise[];
}

export interface PerformedSet {
  reps: number;
  weightKg: number;
}

const REP_RANGES: Record<Goal, { repMin: number; repMax: number }> = {
  fat_loss: { repMin: 10, repMax: 15 },
  maintain: { repMin: 8, repMax: 12 },
  muscle_gain: { repMin: 6, repMax: 10 },
};

const SETS_BY_EXPERIENCE: Record<Experience, number> = {
  beginner: 3,
  intermediate: 4,
  advanced: 5,
};

const DAY_EXERCISE_NAMES: Record<string, string[]> = {
  'Full Body A': ['Barbell Squat', 'Bench Press', 'Bent-Over Row', 'Overhead Press', 'Plank'],
  'Full Body B': ['Deadlift', 'Incline Dumbbell Press', 'Lat Pulldown', 'Dumbbell Shoulder Press', 'Hanging Leg Raise'],
  'Upper A': ['Bench Press', 'Bent-Over Row', 'Overhead Press', 'Bicep Curl', 'Tricep Pushdown'],
  'Lower A': ['Barbell Squat', 'Romanian Deadlift', 'Leg Press', 'Calf Raise', 'Plank'],
  'Upper B': ['Incline Dumbbell Press', 'Lat Pulldown', 'Dumbbell Shoulder Press', 'Hammer Curl', 'Skull Crusher'],
  'Lower B': ['Deadlift', 'Front Squat', 'Leg Curl', 'Standing Calf Raise', 'Hanging Leg Raise'],
  Push: ['Bench Press', 'Overhead Press', 'Incline Dumbbell Press', 'Tricep Pushdown', 'Lateral Raise'],
  Pull: ['Bent-Over Row', 'Lat Pulldown', 'Face Pull', 'Bicep Curl', 'Hammer Curl'],
  Legs: ['Barbell Squat', 'Romanian Deadlift', 'Leg Press', 'Leg Curl', 'Calf Raise'],
};

function dayLabelsFor(daysPerWeek: number): string[] {
  if (daysPerWeek <= 3) {
    const cycle = ['Full Body A', 'Full Body B'];
    return Array.from({ length: daysPerWeek }, (_, i) => cycle[i % cycle.length]);
  }
  if (daysPerWeek === 4) {
    return ['Upper A', 'Lower A', 'Upper B', 'Lower B'];
  }
  const cycle = ['Push', 'Pull', 'Legs'];
  return Array.from({ length: daysPerWeek }, (_, i) => cycle[i % cycle.length]);
}

export function generateRoutine(input: { goal: Goal; daysPerWeek: number; experience: Experience }): RoutineDay[] {
  const { goal, daysPerWeek, experience } = input;
  const { repMin, repMax } = REP_RANGES[goal];
  const sets = SETS_BY_EXPERIENCE[experience];
  const labels = dayLabelsFor(daysPerWeek);

  return labels.map((label) => ({
    label,
    exercises: DAY_EXERCISE_NAMES[label].map((name) => ({ name, sets, repMin, repMax })),
  }));
}

export function suggestNextPerformance(
  lastSets: PerformedSet[] | null,
  repMin: number,
  repMax: number,
): { weightKg: number; reps: number } | null {
  if (!lastSets || lastSets.length === 0) return null;
  const allHitTop = lastSets.every((s) => s.reps >= repMax);
  const lastWeight = lastSets[lastSets.length - 1].weightKg;
  if (allHitTop) {
    return { weightKg: lastWeight + 2.5, reps: repMin };
  }
  return { weightKg: lastWeight, reps: repMax };
}
