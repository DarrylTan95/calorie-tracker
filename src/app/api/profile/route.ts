import { NextResponse } from 'next/server';
import { db } from '@/db';
import { getProfile, saveProfile } from '@/db/queries';
import { ProfileBody } from '@/lib/validate';

export async function GET() {
  return NextResponse.json({ profile: await getProfile(db) });
}

export async function PUT(req: Request) {
  const parsed = ProfileBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
  }
  const profile = await saveProfile(db, parsed.data);
  return NextResponse.json({ profile });
}
