import { NextResponse } from 'next/server';
import { db } from '@/db';
import { getDayLog, upsertDayLog } from '@/db/queries';
import { DateString, DayLogPatchBody } from '@/lib/validate';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') ?? '';
  if (!DateString.safeParse(date).success) {
    return NextResponse.json({ error: 'Missing or invalid date' }, { status: 400 });
  }
  return NextResponse.json(await getDayLog(db, date));
}

export async function PUT(req: Request) {
  const parsed = DayLogPatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
  }
  const { date, ...patch } = parsed.data;
  return NextResponse.json(await upsertDayLog(db, date, patch));
}
