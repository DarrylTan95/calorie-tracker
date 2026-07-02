import { NextResponse } from 'next/server';
import { db } from '@/db';
import { getWeightLog, logWeight } from '@/db/queries';
import { WeightBody } from '@/lib/validate';

export async function GET() {
  return NextResponse.json({ entries: await getWeightLog(db) });
}

export async function POST(req: Request) {
  const parsed = WeightBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
  }
  await logWeight(db, parsed.data);
  return NextResponse.json({ entries: await getWeightLog(db) });
}
