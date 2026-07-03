import { describe, it, expect } from 'vitest';
import { computeWeeklyReview, type DayAdherence, type WeightPoint } from '@/lib/review';

const day = (over: Partial<DayAdherence>): DayAdherence => ({
  date: '2026-07-01', caloriesEaten: 1800, calorieTarget: 1800, proteinEaten: 160, proteinTarget: 160,
  ...over,
});

describe('computeWeeklyReview', () => {
  it('recommends nothing when fewer than 10 logged days exist', () => {
    const result = computeWeeklyReview({ goal: 'fat_loss', days: [day({})], weightPoints: [], loggedDaysCount: 5 });
    expect(result.recommendation).toEqual({
      type: 'insufficient_data',
      message: 'Log a bit more before we can make a recommendation — need at least 10 days of data.',
      calorieAdjustment: null,
    });
  });

  it('prioritizes protein below 80% over any calorie recommendation', () => {
    const result = computeWeeklyReview({
      goal: 'fat_loss',
      days: [day({ proteinEaten: 100, proteinTarget: 160 })], // 62.5%
      weightPoints: [{ date: '2026-06-20', weightKg: 80 }, { date: '2026-07-01', weightKg: 79.9 }],
      loggedDaysCount: 15,
    });
    expect(result.recommendation.type).toBe('improve_protein');
  });

  it('recommends decreasing calories when cutting and weight is flat', () => {
    const weightPoints: WeightPoint[] = [
      { date: '2026-06-17', weightKg: 80 },
      { date: '2026-07-01', weightKg: 79.9 }, // 14 days, -0.125% total -> -0.0625%/week
    ];
    const result = computeWeeklyReview({ goal: 'fat_loss', days: [day({})], weightPoints, loggedDaysCount: 15 });
    expect(result.recommendation).toEqual({
      type: 'decrease_calories',
      message: 'Weight has been flat — try cutting calories a bit.',
      calorieAdjustment: -125,
    });
  });

  it('recommends increasing calories when losing faster than 1%/week', () => {
    const weightPoints: WeightPoint[] = [
      { date: '2026-06-17', weightKg: 80 },
      { date: '2026-07-01', weightKg: 77.6 }, // 14 days, -3% total -> -1.5%/week
    ];
    const result = computeWeeklyReview({ goal: 'fat_loss', days: [day({})], weightPoints, loggedDaysCount: 15 });
    expect(result.recommendation).toEqual({
      type: 'increase_calories',
      message: 'Losing weight faster than recommended — try eating a bit more.',
      calorieAdjustment: 100,
    });
  });

  it('reports on_track for a fat_loss trend between the thresholds', () => {
    const weightPoints: WeightPoint[] = [
      { date: '2026-06-17', weightKg: 80 },
      { date: '2026-07-01', weightKg: 79.2 }, // 14 days, -1% total -> -0.5%/week
    ];
    const result = computeWeeklyReview({ goal: 'fat_loss', days: [day({})], weightPoints, loggedDaysCount: 15 });
    expect(result.recommendation.type).toBe('on_track');
  });

  it('reports on_track for muscle_gain and maintain regardless of weight trend', () => {
    const weightPoints: WeightPoint[] = [
      { date: '2026-06-17', weightKg: 80 },
      { date: '2026-07-01', weightKg: 80 },
    ];
    const gain = computeWeeklyReview({ goal: 'muscle_gain', days: [day({})], weightPoints, loggedDaysCount: 15 });
    const maintain = computeWeeklyReview({ goal: 'maintain', days: [day({})], weightPoints, loggedDaysCount: 15 });
    expect(gain.recommendation.type).toBe('on_track');
    expect(maintain.recommendation.type).toBe('on_track');
  });

  it('returns a null weight trend with fewer than 2 weight points, and falls back to on_track', () => {
    const result = computeWeeklyReview({ goal: 'fat_loss', days: [day({})], weightPoints: [], loggedDaysCount: 15 });
    expect(result.weightTrendPercent).toBeNull();
    expect(result.recommendation.type).toBe('on_track');
  });

  it('averages calorie and protein adherence across days', () => {
    const result = computeWeeklyReview({
      goal: 'maintain',
      days: [
        day({ caloriesEaten: 1800, calorieTarget: 1800, proteinEaten: 160, proteinTarget: 160 }), // 100%/100%
        day({ caloriesEaten: 1600, calorieTarget: 2000, proteinEaten: 140, proteinTarget: 160 }), // 80%/87.5%
      ],
      weightPoints: [],
      loggedDaysCount: 15,
    });
    expect(result.calorieAdherencePercent).toBe(90);
    expect(result.proteinAdherencePercent).toBe(94);
  });
});
