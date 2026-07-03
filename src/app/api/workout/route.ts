import { NextResponse } from 'next/server';
import { db } from '@/db';
import { addSetLogs, advanceRoutineDay, createWorkoutSession, getActiveRoutine, upsertDayLog } from '@/db/queries';
import { LogWorkoutBody } from '@/lib/validate';

export async function POST(req: Request) {
  const parsed = LogWorkoutBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
  }
  const { date, routineDayLabel, notes, sets } = parsed.data;
  const session = await createWorkoutSession(db, { date, routineDayLabel, notes });
  await addSetLogs(db, session.id, sets);
  await upsertDayLog(db, date, { isGymDay: true });
  const routine = await getActiveRoutine(db);
  if (routine) await advanceRoutineDay(db, routine.id);
  return NextResponse.json({ ok: true, sessionId: session.id });
}
