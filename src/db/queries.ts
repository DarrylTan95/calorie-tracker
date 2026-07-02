import { desc, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import * as schema from './schema';
import { calcTargets, type Goal, type Overrides } from '@/lib/targets';

export type DB = PostgresJsDatabase<typeof schema> | PgliteDatabase<typeof schema>;

export interface Profile {
  id: number;
  name: string;
  weightKg: number;
  heightCm: number;
  age: number;
  gender: 'male' | 'female';
  goal: Goal;
  gymDaysPerWeek: number;
  experience: 'beginner' | 'intermediate' | 'advanced';
}

export async function getProfile(db: DB): Promise<Profile | null> {
  const rows = await db.select().from(schema.profile).where(eq(schema.profile.id, 1));
  if (rows.length === 0) return null;
  const { updatedAt: _updatedAt, ...p } = rows[0];
  return p;
}

export async function saveProfile(db: DB, p: Omit<Profile, 'id'>): Promise<Profile> {
  const values = { ...p, id: 1, updatedAt: new Date() };
  await db.insert(schema.profile).values(values)
    .onConflictDoUpdate({ target: schema.profile.id, set: values });
  return { ...p, id: 1 };
}

export async function logWeight(db: DB, entry: { date: string; weightKg: number }): Promise<void> {
  await db.insert(schema.weightLog).values(entry)
    .onConflictDoUpdate({ target: schema.weightLog.date, set: { weightKg: entry.weightKg } });
  await db.update(schema.profile).set({ weightKg: entry.weightKg, updatedAt: new Date() })
    .where(eq(schema.profile.id, 1));
}

export async function getWeightLog(db: DB, limit = 30): Promise<{ date: string; weightKg: number }[]> {
  return db.select().from(schema.weightLog).orderBy(desc(schema.weightLog.date)).limit(limit);
}

export async function getOverrides(db: DB): Promise<Overrides> {
  const rows = await db.select().from(schema.targets).orderBy(desc(schema.targets.id)).limit(1);
  return rows.length === 0 ? {} : (rows[0].overrides as Overrides);
}

export async function saveOverrides(db: DB, overrides: Overrides, effectiveFrom: string): Promise<void> {
  const p = await getProfile(db);
  const calculated = p ? calcTargets({ weightKg: p.weightKg, goal: p.goal }) : null;
  await db.insert(schema.targets).values({ effectiveFrom, calculated, overrides });
}
