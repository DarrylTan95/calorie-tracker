import type { Goal } from './targets';

export interface DayAdherence {
  date: string;
  caloriesEaten: number;
  calorieTarget: number;
  proteinEaten: number;
  proteinTarget: number;
}

export interface WeightPoint {
  date: string;
  weightKg: number;
}

export type RecommendationType = 'decrease_calories' | 'increase_calories' | 'improve_protein' | 'on_track' | 'insufficient_data';

export interface Recommendation {
  type: RecommendationType;
  message: string;
  calorieAdjustment: number | null;
}

export interface WeeklyReviewResult {
  weightTrendPercent: number | null;
  calorieAdherencePercent: number;
  proteinAdherencePercent: number;
  recommendation: Recommendation;
}

const MIN_LOGGED_DAYS = 10;
const PROTEIN_ADHERENCE_MIN = 80;
const FLAT_THRESHOLD = -0.25;
const FAST_LOSS_THRESHOLD = -1;
const CUT_DECREASE_KCAL = -125;
const CUT_INCREASE_KCAL = 100;

function daysBetween(a: string, b: string): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / msPerDay);
}

function averagePercent(
  days: DayAdherence[],
  eatenKey: 'caloriesEaten' | 'proteinEaten',
  targetKey: 'calorieTarget' | 'proteinTarget',
): number {
  if (days.length === 0) return 0;
  const total = days.reduce((sum, d) => sum + (d[eatenKey] / d[targetKey]) * 100, 0);
  return Math.round(total / days.length);
}

function computeWeightTrendPercent(weightPoints: WeightPoint[]): number | null {
  if (weightPoints.length < 2) return null;
  const first = weightPoints[0];
  const last = weightPoints[weightPoints.length - 1];
  const spanDays = daysBetween(first.date, last.date);
  if (spanDays <= 0) return null;
  const percentChange = ((last.weightKg - first.weightKg) / first.weightKg) * 100;
  return percentChange / (spanDays / 7);
}

export function computeWeeklyReview(input: {
  goal: Goal;
  days: DayAdherence[];
  weightPoints: WeightPoint[];
  loggedDaysCount: number;
}): WeeklyReviewResult {
  const weightTrendPercent = computeWeightTrendPercent(input.weightPoints);
  const calorieAdherencePercent = averagePercent(input.days, 'caloriesEaten', 'calorieTarget');
  const proteinAdherencePercent = averagePercent(input.days, 'proteinEaten', 'proteinTarget');

  let recommendation: Recommendation;
  if (input.loggedDaysCount < MIN_LOGGED_DAYS) {
    recommendation = {
      type: 'insufficient_data',
      message: `Log a bit more before we can make a recommendation — need at least ${MIN_LOGGED_DAYS} days of data.`,
      calorieAdjustment: null,
    };
  } else if (proteinAdherencePercent < PROTEIN_ADHERENCE_MIN) {
    recommendation = {
      type: 'improve_protein',
      message: 'Protein has been below target most days — focus there before adjusting calories.',
      calorieAdjustment: null,
    };
  } else if (input.goal === 'fat_loss' && weightTrendPercent !== null && weightTrendPercent > FLAT_THRESHOLD) {
    recommendation = {
      type: 'decrease_calories',
      message: 'Weight has been flat — try cutting calories a bit.',
      calorieAdjustment: CUT_DECREASE_KCAL,
    };
  } else if (input.goal === 'fat_loss' && weightTrendPercent !== null && weightTrendPercent < FAST_LOSS_THRESHOLD) {
    recommendation = {
      type: 'increase_calories',
      message: 'Losing weight faster than recommended — try eating a bit more.',
      calorieAdjustment: CUT_INCREASE_KCAL,
    };
  } else {
    recommendation = {
      type: 'on_track',
      message: 'On track — no changes needed this week.',
      calorieAdjustment: null,
    };
  }

  return { weightTrendPercent, calorieAdherencePercent, proteinAdherencePercent, recommendation };
}
