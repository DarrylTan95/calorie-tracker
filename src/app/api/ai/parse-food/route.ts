import { NextResponse } from 'next/server';
import { isAIEnabled, parseFood } from '@/lib/ai';
import { ParseFoodBody } from '@/lib/validate';

export async function POST(req: Request) {
  if (!isAIEnabled()) {
    return NextResponse.json({ error: 'AI is not enabled' }, { status: 503 });
  }
  const parsed = ParseFoodBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
  }
  try {
    const items = await parseFood(parsed.data.text);
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ error: 'AI request failed' }, { status: 502 });
  }
}
