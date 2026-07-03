import { NextResponse } from 'next/server';
import { db } from '@/db';
import {
  createWeeklyReview, getActiveRoutine, getDayLogsRange, getDiaryEntriesRange,
  getLatestWeeklyReview, getOverrides, getProfile, getWeightLog, getWorkoutSessionsRange,
} from '@/db/queries';
import { addDaysISO } from '@/lib/dates';
import { sumEntries } from '@/lib/food';
import { computeWeeklyReview, type DayAdherence } from '@/lib/review';
import { applyOverrides, calcTargets } from '@/lib/targets';
import { GenerateReviewBody } from '@/lib/validate';

export async function GET() {
  return NextResponse.json({ review: await getLatestWeeklyReview(db) });
}

export async function POST(req: Request) {
  const parsed = GenerateReviewBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
  }
  const { today } = parsed.data;

  const profile = await getProfile(db);
  if (!profile) return NextResponse.json({ error: 'No profile yet' }, { status: 404 });

  const weekStart = addDaysISO(today, -6);
  const lookbackStart = addDaysISO(today, -29);

  const calculated = calcTargets({ weightKg: profile.weightKg, goal: profile.goal });
  const overrides = await getOverrides(db);
  const effective = applyOverrides(calculated, overrides);

  const [weekEntries, weekDayLogs, lookbackEntries, weightLog, sessions, activeRoutine] = await Promise.all([
    getDiaryEntriesRange(db, weekStart, today),
    getDayLogsRange(db, weekStart, today),
    getDiaryEntriesRange(db, lookbackStart, today),
    getWeightLog(db, 60),
    getWorkoutSessionsRange(db, weekStart, today),
    getActiveRoutine(db),
  ]);

  const dayLogByDate = new Map(weekDayLogs.map((d) => [d.date, d]));
  const days: DayAdherence[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDaysISO(weekStart, i);
    const entriesForDate = weekEntries.filter((e) => e.date === date);
    const totals = sumEntries(entriesForDate);
    const isGymDay = dayLogByDate.get(date)?.isGymDay ?? true;
    days.push({
      date,
      caloriesEaten: totals.calories,
      calorieTarget: isGymDay ? effective.caloriesGym : effective.caloriesRest,
      proteinEaten: totals.protein,
      proteinTarget: effective.protein,
    });
  }

  const loggedDaysCount = new Set(lookbackEntries.map((e) => e.date)).size;
  const weightPoints = weightLog
    .filter((w) => w.date >= lookbackStart && w.date <= today)
    .slice()
    .reverse(); // getWeightLog returns descending; computeWeeklyReview expects chronological order

  const result = computeWeeklyReview({
    goal: profile.goal,
    days,
    weightPoints,
    loggedDaysCount,
  });

  const review = await createWeeklyReview(db, {
    weekStart,
    weightTrendPercent: result.weightTrendPercent,
    calorieAdherencePercent: result.calorieAdherencePercent,
    proteinAdherencePercent: result.proteinAdherencePercent,
    workoutsCompleted: sessions.length,
    workoutsPlanned: activeRoutine?.daysPerWeek ?? 0,
    recommendation: result.recommendation,
  });

  return NextResponse.json({ review });
}
