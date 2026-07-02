import { NextResponse } from 'next/server';
import { db } from '@/db';
import { getOverrides, getProfile, saveOverrides } from '@/db/queries';
import { applyOverrides, calcTargets, type Overrides } from '@/lib/targets';
import { TargetsBody } from '@/lib/validate';

async function targetsPayload() {
  const profile = await getProfile(db);
  if (!profile) return null;
  const calculated = calcTargets({ weightKg: profile.weightKg, goal: profile.goal });
  const overrides = await getOverrides(db);
  return { calculated, overrides, effective: applyOverrides(calculated, overrides) };
}

export async function GET() {
  const payload = await targetsPayload();
  if (!payload) return NextResponse.json({ error: 'No profile yet' }, { status: 404 });
  return NextResponse.json(payload);
}

export async function PUT(req: Request) {
  const parsed = TargetsBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
  }
  // Check the profile exists BEFORE inserting: the targets row snapshots
  // calculated values, which requires a profile (not-null column).
  if (!(await getProfile(db))) {
    return NextResponse.json({ error: 'No profile yet' }, { status: 404 });
  }
  await saveOverrides(db, parsed.data.overrides as Overrides, parsed.data.effectiveFrom);
  return NextResponse.json(await targetsPayload());
}
