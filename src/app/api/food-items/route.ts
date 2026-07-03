import { NextResponse } from 'next/server';
import { db } from '@/db';
import { createFoodItem, getFavoriteFoodItems, getRecentFoodItems, searchFoodItems } from '@/db/queries';
import { CreateFoodItemBody } from '@/lib/validate';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('recent')) {
    return NextResponse.json({ items: await getRecentFoodItems(db) });
  }
  if (searchParams.get('favorite')) {
    return NextResponse.json({ items: await getFavoriteFoodItems(db) });
  }
  const q = searchParams.get('q') ?? '';
  return NextResponse.json({ items: await searchFoodItems(db, q) });
}

export async function POST(req: Request) {
  const parsed = CreateFoodItemBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
  }
  const item = await createFoodItem(db, parsed.data);
  return NextResponse.json({ item });
}
