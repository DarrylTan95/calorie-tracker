import { NextResponse } from 'next/server';
import { db } from '@/db';
import { deleteDiaryEntry, getDiaryEntries } from '@/db/queries';
import { DateString } from '@/lib/validate';

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') ?? '';
  if (!DateString.safeParse(date).success) {
    return NextResponse.json({ error: 'Missing or invalid date' }, { status: 400 });
  }
  await deleteDiaryEntry(db, numericId);
  return NextResponse.json({ entries: await getDiaryEntries(db, date) });
}
