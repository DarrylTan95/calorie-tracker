import { NextResponse } from 'next/server';
import { db } from '@/db';
import { setFoodItemFavorite } from '@/db/queries';
import { SetFavoriteBody } from '@/lib/validate';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const parsed = SetFavoriteBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
  }
  await setFoodItemFavorite(db, numericId, parsed.data.isFavorite);
  return NextResponse.json({ ok: true });
}
