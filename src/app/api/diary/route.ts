import { NextResponse } from 'next/server';
import { db } from '@/db';
import { addDiaryEntry, getDiaryEntries } from '@/db/queries';
import { AddDiaryEntryBody, DateString } from '@/lib/validate';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') ?? '';
  if (!DateString.safeParse(date).success) {
    return NextResponse.json({ error: 'Missing or invalid date' }, { status: 400 });
  }
  return NextResponse.json({ entries: await getDiaryEntries(db, date) });
}

export async function POST(req: Request) {
  const parsed = AddDiaryEntryBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
  }
  await addDiaryEntry(db, parsed.data);
  return NextResponse.json({ entries: await getDiaryEntries(db, parsed.data.date) });
}
