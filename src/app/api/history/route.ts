import { NextResponse } from 'next/server';
import { db } from '@/db';
import {
  getDayLogsRange, getDiaryEntriesRange, getOverrides, getProfile, getWeightLog, getWorkoutSessionsRange,
} from '@/db/queries';
import { addDaysISO } from '@/lib/dates';
import { sumEntries } from '@/lib/food';
import { applyOverrides, calcTargets } from '@/lib/targets';
import { DateString } from '@/lib/validate';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const today = searchParams.get('today') ?? '';
  if (!DateString.safeParse(today).success) {
    return NextResponse.json({ error: 'Missing or invalid today' }, { status: 400 });
  }
  const daysParam = Number(searchParams.get('days'));
  const days = Number.isInteger(daysParam) && daysParam > 0 && daysParam <= 60 ? daysParam : 14;

  const profile = await getProfile(db);
  if (!profile) return NextResponse.json({ error: 'No profile yet' }, { status: 404 });

  const fromDate = addDaysISO(today, -(days - 1));
  const calculated = calcTargets({ weightKg: profile.weightKg, goal: profile.goal });
  const overrides = await getOverrides(db);
  const effective = applyOverrides(calculated, overrides);

  const [entries, dayLogs, sessions, weightLog] = await Promise.all([
    getDiaryEntriesRange(db, fromDate, today),
    getDayLogsRange(db, fromDate, today),
    getWorkoutSessionsRange(db, fromDate, today),
    getWeightLog(db, 60),
  ]);

  const dayLogByDate = new Map(dayLogs.map((d) => [d.date, d]));
  const sessionByDate = new Map(sessions.map((s) => [s.date, s]));
  const weightByDate = new Map(weightLog.map((w) => [w.date, w.weightKg]));

  const result = [];
  for (let i = 0; i < days; i++) {
    const date = addDaysISO(today, -i);
    const entriesForDate = entries.filter((e) => e.date === date);
    const totals = sumEntries(entriesForDate);
    const isGymDay = dayLogByDate.get(date)?.isGymDay ?? true;
    result.push({
      date,
      totals,
      calorieTarget: isGymDay ? effective.caloriesGym : effective.caloriesRest,
      isGymDay,
      waterL: dayLogByDate.get(date)?.waterL ?? 0,
      workoutLabel: sessionByDate.get(date)?.routineDayLabel ?? null,
      weightKg: weightByDate.get(date) ?? null,
      entries: entriesForDate,
    });
  }

  return NextResponse.json({ days: result });
}
