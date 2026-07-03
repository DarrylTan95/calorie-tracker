import { NextResponse } from 'next/server';
import { db } from '@/db';
import { getLastSetsForExercise } from '@/db/queries';
import { suggestNextPerformance } from '@/lib/routine';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const exercise = searchParams.get('exercise') ?? '';
  const repMin = Number(searchParams.get('repMin'));
  const repMax = Number(searchParams.get('repMax'));
  if (!exercise || !Number.isFinite(repMin) || !Number.isFinite(repMax)) {
    return NextResponse.json({ error: 'Missing or invalid exercise/repMin/repMax' }, { status: 400 });
  }
  const lastSets = await getLastSetsForExercise(db, exercise);
  return NextResponse.json({ suggestion: suggestNextPerformance(lastSets, repMin, repMax) });
}
