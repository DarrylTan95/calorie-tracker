import { NextResponse } from 'next/server';
import { db } from '@/db';
import { applyWeeklyReviewRecommendation, getLatestWeeklyReview } from '@/db/queries';
import { ApplyReviewBody } from '@/lib/validate';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reviewId = Number(id);
  if (!Number.isInteger(reviewId) || reviewId <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const parsed = ApplyReviewBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
  }
  try {
    await applyWeeklyReviewRecommendation(db, reviewId, parsed.data.effectiveFrom);
  } catch {
    return NextResponse.json({ error: 'Could not apply this review' }, { status: 400 });
  }
  return NextResponse.json({ review: await getLatestWeeklyReview(db) });
}
