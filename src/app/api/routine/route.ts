import { NextResponse } from 'next/server';
import { db } from '@/db';
import { createRoutine, getActiveRoutine } from '@/db/queries';
import { generateRoutine } from '@/lib/routine';
import { GenerateRoutineBody } from '@/lib/validate';

export async function GET() {
  return NextResponse.json({ routine: await getActiveRoutine(db) });
}

export async function POST(req: Request) {
  const parsed = GenerateRoutineBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
  }
  const days = generateRoutine(parsed.data);
  const routine = await createRoutine(db, { ...parsed.data, days });
  return NextResponse.json({ routine });
}
