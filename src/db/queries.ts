import { and, desc, eq, ilike, isNotNull, max, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import * as schema from './schema';
import { calcTargets, type Goal, type Overrides } from '@/lib/targets';
import type { RoutineDay, PerformedSet } from '@/lib/routine';

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
  if (!p) throw new Error('Cannot save target overrides before a profile exists');
  const calculated = calcTargets({ weightKg: p.weightKg, goal: p.goal });
  await db.insert(schema.targets).values({ effectiveFrom, calculated, overrides });
}

export interface FoodItem {
  id: number;
  name: string;
  portionLabel: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  isCustom: boolean;
  isFavorite: boolean;
}

function toFoodItem(row: typeof schema.foodItems.$inferSelect): FoodItem {
  const { createdAt: _createdAt, ...item } = row;
  return item;
}

export async function searchFoodItems(db: DB, query: string, limit = 20): Promise<FoodItem[]> {
  const q = query.trim();
  if (!q) return [];
  const rows = await db.select().from(schema.foodItems)
    .where(ilike(schema.foodItems.name, `%${q}%`))
    .orderBy(desc(schema.foodItems.isFavorite), schema.foodItems.name)
    .limit(limit);
  return rows.map(toFoodItem);
}

export async function getFavoriteFoodItems(db: DB): Promise<FoodItem[]> {
  const rows = await db.select().from(schema.foodItems)
    .where(eq(schema.foodItems.isFavorite, true))
    .orderBy(schema.foodItems.name);
  return rows.map(toFoodItem);
}

export async function getRecentFoodItems(db: DB, limit = 8): Promise<FoodItem[]> {
  // NOTE: two deviations from the brief's exact query, found via a minimal
  // repro script (see task-3-report.md):
  // 1. Ordering by a repeated `desc(max(...))` expression (rather than
  //    referencing the already-computed aggregate select-list column)
  //    returned rows in the wrong order against the installed
  //    drizzle-orm/PGlite combo, confirmed by comparing raw SQL (correct)
  //    against the ORM-built query (incorrect). Fixed by ordering by the
  //    select-list ordinal position instead.
  // 2. `loggedAt` timestamps can tie at millisecond resolution when entries
  //    are inserted in quick succession (e.g. in tests), making `max(logged_at)`
  //    alone a non-deterministic tiebreaker. Added `max(id)` (serial, so
  //    strictly monotonic) as a secondary sort key to make ordering stable
  //    regardless of timestamp collisions.
  const recentIds = await db
    .select({
      foodItemId: schema.diaryEntries.foodItemId,
      lastLoggedAt: max(schema.diaryEntries.loggedAt),
      lastId: max(schema.diaryEntries.id),
    })
    .from(schema.diaryEntries)
    .where(isNotNull(schema.diaryEntries.foodItemId))
    .groupBy(schema.diaryEntries.foodItemId)
    .orderBy(sql`2 desc`, sql`3 desc`)
    .limit(limit);

  if (recentIds.length === 0) return [];
  const ids = recentIds.map((r) => r.foodItemId as number);
  const rows = await db.select().from(schema.foodItems).where(sql`${schema.foodItems.id} IN ${ids}`);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is typeof rows[number] => !!r).map(toFoodItem);
}

export async function createFoodItem(
  db: DB,
  item: Omit<FoodItem, 'id' | 'isFavorite' | 'isCustom'>,
): Promise<FoodItem> {
  const [row] = await db.insert(schema.foodItems)
    .values({ ...item, isCustom: true, isFavorite: false })
    .returning();
  return toFoodItem(row);
}

export async function setFoodItemFavorite(db: DB, id: number, isFavorite: boolean): Promise<void> {
  await db.update(schema.foodItems).set({ isFavorite }).where(eq(schema.foodItems.id, id));
}

export interface DiaryEntry {
  id: number;
  date: string;
  mealSlot: 'breakfast' | 'lunch' | 'dinner' | 'snacks';
  foodItemId: number | null;
  name: string;
  portionMultiplier: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

function toDiaryEntry(row: typeof schema.diaryEntries.$inferSelect): DiaryEntry {
  const { loggedAt: _loggedAt, ...entry } = row;
  return entry;
}

export async function getDiaryEntries(db: DB, date: string): Promise<DiaryEntry[]> {
  const rows = await db.select().from(schema.diaryEntries)
    .where(eq(schema.diaryEntries.date, date))
    .orderBy(schema.diaryEntries.loggedAt);
  return rows.map(toDiaryEntry);
}

export async function addDiaryEntry(db: DB, entry: Omit<DiaryEntry, 'id'>): Promise<DiaryEntry> {
  const [row] = await db.insert(schema.diaryEntries).values(entry).returning();
  return toDiaryEntry(row);
}

export async function deleteDiaryEntry(db: DB, id: number): Promise<void> {
  await db.delete(schema.diaryEntries).where(eq(schema.diaryEntries.id, id));
}

export interface DayLog {
  date: string;
  waterL: number;
  isGymDay: boolean;
}

const DAY_LOG_DEFAULTS = { waterL: 0, isGymDay: true };

export async function getDayLog(db: DB, date: string): Promise<DayLog> {
  const rows = await db.select().from(schema.dayLog).where(eq(schema.dayLog.date, date));
  return rows.length === 0 ? { date, ...DAY_LOG_DEFAULTS } : rows[0];
}

export async function upsertDayLog(
  db: DB,
  date: string,
  patch: { waterL?: number; isGymDay?: boolean },
): Promise<DayLog> {
  const current = await getDayLog(db, date);
  const next = { date, waterL: patch.waterL ?? current.waterL, isGymDay: patch.isGymDay ?? current.isGymDay };
  await db.insert(schema.dayLog).values(next)
    .onConflictDoUpdate({ target: schema.dayLog.date, set: { waterL: next.waterL, isGymDay: next.isGymDay } });
  return next;
}

export interface Routine {
  id: number;
  goal: Goal;
  daysPerWeek: number;
  experience: 'beginner' | 'intermediate' | 'advanced';
  days: RoutineDay[];
  currentDayIndex: number;
  isActive: boolean;
}

function toRoutine(row: typeof schema.routines.$inferSelect): Routine {
  const { createdAt: _createdAt, ...rest } = row;
  return { ...rest, days: row.days as RoutineDay[] };
}

export async function getActiveRoutine(db: DB): Promise<Routine | null> {
  const rows = await db.select().from(schema.routines)
    .where(eq(schema.routines.isActive, true))
    .orderBy(desc(schema.routines.id))
    .limit(1);
  return rows.length === 0 ? null : toRoutine(rows[0]);
}

export async function createRoutine(
  db: DB,
  input: { goal: Goal; daysPerWeek: number; experience: 'beginner' | 'intermediate' | 'advanced'; days: RoutineDay[] },
): Promise<Routine> {
  await db.update(schema.routines).set({ isActive: false }).where(eq(schema.routines.isActive, true));
  const [row] = await db.insert(schema.routines)
    .values({ ...input, currentDayIndex: 0, isActive: true })
    .returning();
  return toRoutine(row);
}

export async function advanceRoutineDay(db: DB, routineId: number): Promise<void> {
  const rows = await db.select().from(schema.routines).where(eq(schema.routines.id, routineId));
  if (rows.length === 0) return;
  const days = rows[0].days as RoutineDay[];
  const next = (rows[0].currentDayIndex + 1) % days.length;
  await db.update(schema.routines).set({ currentDayIndex: next }).where(eq(schema.routines.id, routineId));
}

export interface WorkoutSession {
  id: number;
  date: string;
  routineDayLabel: string;
  notes: string | null;
}

export async function createWorkoutSession(
  db: DB,
  input: { date: string; routineDayLabel: string; notes?: string },
): Promise<WorkoutSession> {
  const [row] = await db.insert(schema.workoutSessions)
    .values({ date: input.date, routineDayLabel: input.routineDayLabel, notes: input.notes ?? null })
    .returning();
  return row;
}

export async function addSetLogs(
  db: DB,
  sessionId: number,
  sets: { exerciseName: string; setNumber: number; reps: number; weightKg: number }[],
): Promise<void> {
  if (sets.length === 0) return;
  await db.insert(schema.setLogs).values(sets.map((s) => ({ ...s, sessionId })));
}

export async function getLastSetsForExercise(db: DB, exerciseName: string): Promise<PerformedSet[] | null> {
  const latestSession = await db
    .select({ sessionId: schema.setLogs.sessionId })
    .from(schema.setLogs)
    .innerJoin(schema.workoutSessions, eq(schema.setLogs.sessionId, schema.workoutSessions.id))
    .where(eq(schema.setLogs.exerciseName, exerciseName))
    .orderBy(desc(schema.workoutSessions.date), desc(schema.setLogs.sessionId))
    .limit(1);

  if (latestSession.length === 0) return null;

  return db.select({ reps: schema.setLogs.reps, weightKg: schema.setLogs.weightKg })
    .from(schema.setLogs)
    .where(and(eq(schema.setLogs.sessionId, latestSession[0].sessionId), eq(schema.setLogs.exerciseName, exerciseName)))
    .orderBy(schema.setLogs.setNumber);
}
