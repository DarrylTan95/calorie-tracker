# Fuel Log Phase 2: Today Tab (Food Logging) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working Today tab: log food against a searchable database or by hand, see calorie/macro/water progress against targets, toggle gym/rest day, and manage entries grouped by meal slot — all persisted and synced via the existing Neon database.

**Architecture:** Same as Phase 1 — Next.js App Router API routes over Drizzle/Postgres, pure functions in `src/lib` for totals math, thin `src/db/queries.ts` additions, React client components composed on the Today page. No AI in this phase (the spec's AI-free core); the dormant AI layer described in the design spec is out of scope until a future phase.

**Tech Stack:** Same as Phase 1 (Next.js, TypeScript, Tailwind, Drizzle ORM, Neon Postgres, zod, Vitest, PGlite for tests). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-02-fuel-log-app-design.md`, section 4.1 (Today) and section 5 (food_items, diary_entries, day_log tables). This is Phase 2 of 4 (Phase 1: foundation/profile, complete; Phase 3: Train tab; Phase 4: Coach reviews + History + PWA polish).

**Scope notes (deviations from spec, flagging for approval):**
1. The spec calls for "~300" seeded food items. This plan seeds 50 curated items spanning the categories the spec names (SG hawker, western, gym staples) to keep the plan reviewable and the initial deploy fast. The seed script and `food_items` table both support adding more later with zero code changes — either by editing `scripts/seed-food-data.json` and re-running `npm run db:seed`, or organically via the app's "save as reusable item" path on manual entries. If 50 is too few to be useful on day one, say so before this plan is executed and we'll expand the seed list first.
2. The spec says entries are listed "with edit/delete" (section 4.1). This plan implements delete only (Task 9); editing a logged entry is done by deleting it and re-logging. Adding true in-place edit (adjusting portion/macros on an existing entry without deleting it) is a small, isolable follow-up if delete-and-relog proves annoying in practice — flagging now rather than silently dropping the word "edit" from the spec.

## Global Constraints

- TypeScript strict mode; no `any` in committed code.
- Single-user app: no `user_id` columns anywhere.
- All dates are client-supplied `YYYY-MM-DD` strings via `todayLocalISO()` (already exists at `src/lib/dates.ts`) — never compute "today" server-side. Client-side "current hour" for UI defaults (e.g. suggesting a meal slot) is fine since it's not business-date logic.
- Dark theme only. Palette already established: bg `#0a0f1a`, cards `bg-gray-900`/`bg-[#111827]`, accent `blue-400`/`blue-600`, text `gray-50`/`gray-200`, muted `gray-500`. Follow the exact Tailwind class patterns used in `src/components/profile/*.tsx`.
- Run `npm run test` before every commit; run `npm run build` before any task that touches routes/pages.
- Working directory for all commands: `/Users/darryltan/Calorie App`.
- Every DB-touching query function takes `db: DB` (from `@/db/queries`) as its first argument, matching the existing Phase 1 pattern — this is what lets tests run against PGlite while production uses postgres-js.

---

### Task 1: Extend schema — food_items, diary_entries, day_log

**Files:**
- Modify: `src/db/schema.ts`
- Create migration via `npm run db:generate` (generated `drizzle/000X_*.sql`)

**Interfaces:**
- Consumes: existing `pgTable`/column helpers already imported in `schema.ts`.
- Produces (new Drizzle tables, importable from `@/db/schema`):
  - `foodItems`: `id` (serial pk), `name` (text, not null), `portionLabel` (text, not null), `kcal` (real, not null), `protein` (real, not null), `carbs` (real, not null), `fat` (real, not null), `isCustom` (boolean, not null, default false), `isFavorite` (boolean, not null, default false), `createdAt` (timestamp, not null, default now).
  - `diaryEntries`: `id` (serial pk), `date` (date, not null), `mealSlot` (text enum `['breakfast','lunch','dinner','snacks']`, not null), `foodItemId` (integer, nullable, references `foodItems.id`), `name` (text, not null), `portionMultiplier` (real, not null, default 1), `calories` (real, not null), `protein` (real, not null), `carbs` (real, not null), `fat` (real, not null), `loggedAt` (timestamp, not null, default now — used only for "recent items" ordering, never for business-date logic).
  - `dayLog`: `date` (date, primary key), `waterL` (real, not null, default 0), `isGymDay` (boolean, not null, default true).

- [ ] **Step 1: Add the three tables to schema.ts**

Read the current file first, then append after the existing `weightLog` export:

```ts
import { pgTable, serial, text, real, integer, date, timestamp, jsonb, boolean } from 'drizzle-orm/pg-core';
```

(Add `boolean` to the existing import line at the top of the file — it's not currently imported.)

Append to `src/db/schema.ts`:

```ts
export const foodItems = pgTable('food_items', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  portionLabel: text('portion_label').notNull(),
  kcal: real('kcal').notNull(),
  protein: real('protein').notNull(),
  carbs: real('carbs').notNull(),
  fat: real('fat').notNull(),
  isCustom: boolean('is_custom').notNull().default(false),
  isFavorite: boolean('is_favorite').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const diaryEntries = pgTable('diary_entries', {
  id: serial('id').primaryKey(),
  date: date('date').notNull(),
  mealSlot: text('meal_slot', { enum: ['breakfast', 'lunch', 'dinner', 'snacks'] }).notNull(),
  foodItemId: integer('food_item_id').references(() => foodItems.id),
  name: text('name').notNull(),
  portionMultiplier: real('portion_multiplier').notNull().default(1),
  calories: real('calories').notNull(),
  protein: real('protein').notNull(),
  carbs: real('carbs').notNull(),
  fat: real('fat').notNull(),
  loggedAt: timestamp('logged_at').notNull().defaultNow(),
});

export const dayLog = pgTable('day_log', {
  date: date('date').primaryKey(),
  waterL: real('water_l').notNull().default(0),
  isGymDay: boolean('is_gym_day').notNull().default(true),
});
```

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: creates `drizzle/0001_*.sql` containing three new `CREATE TABLE` statements (`food_items`, `diary_entries`, `day_log`) and a foreign key from `diary_entries.food_item_id` to `food_items.id`.

- [ ] **Step 3: Verify the migration file**

Read the generated SQL file and confirm: `food_items` has no `NOT NULL` violation risk on `is_custom`/`is_favorite` (both have defaults), `diary_entries.food_item_id` is nullable, `day_log.date` is the primary key.

- [ ] **Step 4: Run existing tests to confirm nothing broke**

Run: `npm run test`
Expected: all existing tests still pass (schema changes are additive only).

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat: add food_items, diary_entries, and day_log schema"
```

---

### Task 2: Food totals pure functions (TDD)

**Files:**
- Create: `src/lib/food.ts`
- Test: `tests/food.test.ts`

**Interfaces:**
- Produces:
  - `type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snacks'`
  - `interface Macros { calories: number; protein: number; carbs: number; fat: number }`
  - `interface DiaryEntry extends Macros { id: number; date: string; mealSlot: MealSlot; foodItemId: number | null; name: string; portionMultiplier: number }`
  - `sumEntries(entries: Macros[]): Macros` — sums calories/protein/carbs/fat, rounding each to the nearest integer except it does NOT round (callers round for display; keep raw sums here so repeated additions don't compound rounding error) — see test for exact expectations.
  - `groupByMealSlot(entries: DiaryEntry[]): Record<MealSlot, DiaryEntry[]>` — always returns all four keys (possibly empty arrays), preserving each slot's entries in their original order.
  - `MEAL_SLOTS: MealSlot[]` — `['breakfast', 'lunch', 'dinner', 'snacks']` in display order.

- [ ] **Step 1: Write failing tests**

Create `tests/food.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sumEntries, groupByMealSlot, MEAL_SLOTS, type DiaryEntry } from '@/lib/food';

const entry = (over: Partial<DiaryEntry>): DiaryEntry => ({
  id: 1, date: '2026-07-02', mealSlot: 'lunch', foodItemId: null,
  name: 'Test', portionMultiplier: 1, calories: 0, protein: 0, carbs: 0, fat: 0,
  ...over,
});

describe('sumEntries', () => {
  it('sums macros across entries', () => {
    const entries = [
      { calories: 500, protein: 30, carbs: 60, fat: 15 },
      { calories: 250, protein: 10, carbs: 20, fat: 8 },
    ];
    expect(sumEntries(entries)).toEqual({ calories: 750, protein: 40, carbs: 80, fat: 23 });
  });

  it('returns all zeros for an empty list', () => {
    expect(sumEntries([])).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  });

  it('preserves fractional values without rounding', () => {
    const entries = [{ calories: 100.5, protein: 5.25, carbs: 10.1, fat: 2.3 }];
    expect(sumEntries(entries)).toEqual({ calories: 100.5, protein: 5.25, carbs: 10.1, fat: 2.3 });
  });
});

describe('groupByMealSlot', () => {
  it('groups entries under all four slots, preserving order within a slot', () => {
    const entries = [
      entry({ id: 1, mealSlot: 'breakfast', name: 'Oats' }),
      entry({ id: 2, mealSlot: 'lunch', name: 'Chicken Rice' }),
      entry({ id: 3, mealSlot: 'lunch', name: 'Kopi O' }),
    ];
    const grouped = groupByMealSlot(entries);
    expect(Object.keys(grouped).sort()).toEqual(['breakfast', 'dinner', 'lunch', 'snacks'].sort());
    expect(grouped.breakfast.map((e) => e.name)).toEqual(['Oats']);
    expect(grouped.lunch.map((e) => e.name)).toEqual(['Chicken Rice', 'Kopi O']);
    expect(grouped.dinner).toEqual([]);
    expect(grouped.snacks).toEqual([]);
  });

  it('returns all-empty groups for an empty list', () => {
    const grouped = groupByMealSlot([]);
    for (const slot of MEAL_SLOTS) {
      expect(grouped[slot]).toEqual([]);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test`
Expected: FAIL — cannot resolve `@/lib/food`.

- [ ] **Step 3: Implement**

Create `src/lib/food.ts`:

```ts
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snacks';

export const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snacks'];

export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface DiaryEntry extends Macros {
  id: number;
  date: string;
  mealSlot: MealSlot;
  foodItemId: number | null;
  name: string;
  portionMultiplier: number;
}

export function sumEntries(entries: Macros[]): Macros {
  return entries.reduce(
    (acc, e) => ({
      calories: acc.calories + e.calories,
      protein: acc.protein + e.protein,
      carbs: acc.carbs + e.carbs,
      fat: acc.fat + e.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export function groupByMealSlot(entries: DiaryEntry[]): Record<MealSlot, DiaryEntry[]> {
  const groups: Record<MealSlot, DiaryEntry[]> = { breakfast: [], lunch: [], dinner: [], snacks: [] };
  for (const entry of entries) {
    groups[entry.mealSlot].push(entry);
  }
  return groups;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: food totals and meal-slot grouping pure functions"
```

---

### Task 3: Queries module additions — food items, diary entries, day log

**Files:**
- Modify: `src/db/queries.ts`
- Test: `tests/queries-food.test.ts`

**Interfaces:**
- Consumes: `foodItems`, `diaryEntries`, `dayLog` from `@/db/schema` (Task 1); `DB` type, existing `queries.ts` patterns.
- Produces (all functions take `db: DB` first):
  - `interface FoodItem { id: number; name: string; portionLabel: string; kcal: number; protein: number; carbs: number; fat: number; isCustom: boolean; isFavorite: boolean }`
  - `searchFoodItems(db, query: string, limit = 20): Promise<FoodItem[]>` — case-insensitive substring match on `name`, ordered `isFavorite` desc then `name` asc. Empty/whitespace query returns `[]` without hitting the DB.
  - `getFavoriteFoodItems(db): Promise<FoodItem[]>` — `isFavorite = true`, ordered by name.
  - `getRecentFoodItems(db, limit = 8): Promise<FoodItem[]>` — distinct `food_item_id`s from `diaryEntries` (excluding nulls), most recent `loggedAt` first, joined to `foodItems`.
  - `createFoodItem(db, item: Omit<FoodItem, 'id' | 'isFavorite'>): Promise<FoodItem>` — always inserts with `isCustom: true`, `isFavorite: false`.
  - `setFoodItemFavorite(db, id: number, isFavorite: boolean): Promise<void>`
  - `interface DiaryEntryRow extends DiaryEntry` (re-export shape from `@/lib/food`, plus nothing extra — the DB row IS the `DiaryEntry` shape)
  - `getDiaryEntries(db, date: string): Promise<DiaryEntry[]>` — ordered by `loggedAt` ascending (stable log order within a day).
  - `addDiaryEntry(db, entry: Omit<DiaryEntry, 'id'>): Promise<DiaryEntry>`
  - `deleteDiaryEntry(db, id: number): Promise<void>`
  - `interface DayLog { date: string; waterL: number; isGymDay: boolean }`
  - `getDayLog(db, date: string): Promise<DayLog>` — returns `{ date, waterL: 0, isGymDay: true }` if no row exists yet (matches the app default of assuming gym day until told otherwise, consistent with the Phase 1 prototype's default).
  - `upsertDayLog(db, date: string, patch: { waterL?: number; isGymDay?: boolean }): Promise<DayLog>` — merges `patch` onto the existing row (or the defaults above if none exists yet), then upserts.

- [ ] **Step 1: Write failing tests**

Create `tests/queries-food.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers/db';
import {
  saveProfile, searchFoodItems, getFavoriteFoodItems, getRecentFoodItems,
  createFoodItem, setFoodItemFavorite, getDiaryEntries, addDiaryEntry,
  deleteDiaryEntry, getDayLog, upsertDayLog, type DB,
} from '@/db/queries';

const BASE_PROFILE = {
  name: 'Darryl', weightKg: 85, heightCm: 170, age: 31,
  gender: 'male' as const, goal: 'fat_loss' as const,
  gymDaysPerWeek: 4, experience: 'intermediate' as const,
};

let db: DB;
beforeEach(async () => { db = await createTestDb(); });

describe('food items', () => {
  it('creates a custom item as isCustom, not favorite', async () => {
    const item = await createFoodItem(db, {
      name: 'Chicken Rice', portionLabel: '1 plate', kcal: 600, protein: 35, carbs: 70, fat: 18,
    });
    expect(item.isCustom).toBe(true);
    expect(item.isFavorite).toBe(false);
    expect(item.id).toBeTypeOf('number');
  });

  it('searches case-insensitively by substring, favorites first', async () => {
    await createFoodItem(db, { name: 'Chicken Rice', portionLabel: '1 plate', kcal: 600, protein: 35, carbs: 70, fat: 18 });
    const bee = await createFoodItem(db, { name: 'Chicken Chop', portionLabel: '1 plate', kcal: 700, protein: 40, carbs: 50, fat: 30 });
    await setFoodItemFavorite(db, bee.id, true);

    const results = await searchFoodItems(db, 'chicken');
    expect(results.map((r) => r.name)).toEqual(['Chicken Chop', 'Chicken Rice']);
  });

  it('returns empty array for blank query without querying the db', async () => {
    expect(await searchFoodItems(db, '   ')).toEqual([]);
  });

  it('returns favorites ordered by name', async () => {
    const a = await createFoodItem(db, { name: 'Zebra Bar', portionLabel: '1 bar', kcal: 200, protein: 10, carbs: 20, fat: 5 });
    const b = await createFoodItem(db, { name: 'Apple', portionLabel: '1 medium', kcal: 95, protein: 0, carbs: 25, fat: 0 });
    await setFoodItemFavorite(db, a.id, true);
    await setFoodItemFavorite(db, b.id, true);
    const favs = await getFavoriteFoodItems(db);
    expect(favs.map((f) => f.name)).toEqual(['Apple', 'Zebra Bar']);
  });

  it('returns recent items most-recently-logged first, deduped', async () => {
    await saveProfile(db, BASE_PROFILE);
    const rice = await createFoodItem(db, { name: 'Chicken Rice', portionLabel: '1 plate', kcal: 600, protein: 35, carbs: 70, fat: 18 });
    const kopi = await createFoodItem(db, { name: 'Kopi O', portionLabel: '1 cup', kcal: 20, protein: 0, carbs: 5, fat: 0 });
    await addDiaryEntry(db, {
      date: '2026-07-01', mealSlot: 'lunch', foodItemId: rice.id, name: rice.name,
      portionMultiplier: 1, calories: 600, protein: 35, carbs: 70, fat: 18,
    });
    await addDiaryEntry(db, {
      date: '2026-07-02', mealSlot: 'breakfast', foodItemId: kopi.id, name: kopi.name,
      portionMultiplier: 1, calories: 20, protein: 0, carbs: 5, fat: 0,
    });
    // Log rice again on a later date — it should move to the front, appearing once.
    await addDiaryEntry(db, {
      date: '2026-07-02', mealSlot: 'lunch', foodItemId: rice.id, name: rice.name,
      portionMultiplier: 1, calories: 600, protein: 35, carbs: 70, fat: 18,
    });
    const recent = await getRecentFoodItems(db);
    expect(recent.map((r) => r.name)).toEqual(['Chicken Rice', 'Kopi O']);
  });
});

describe('diary entries', () => {
  it('adds and retrieves entries for a date, ordered by log order', async () => {
    await addDiaryEntry(db, {
      date: '2026-07-02', mealSlot: 'breakfast', foodItemId: null, name: 'Oats',
      portionMultiplier: 1, calories: 300, protein: 10, carbs: 50, fat: 5,
    });
    await addDiaryEntry(db, {
      date: '2026-07-02', mealSlot: 'lunch', foodItemId: null, name: 'Chicken Rice',
      portionMultiplier: 1.5, calories: 900, protein: 52, carbs: 105, fat: 27,
    });
    await addDiaryEntry(db, {
      date: '2026-07-03', mealSlot: 'breakfast', foodItemId: null, name: 'Toast',
      portionMultiplier: 1, calories: 200, protein: 6, carbs: 30, fat: 4,
    });

    const entries = await getDiaryEntries(db, '2026-07-02');
    expect(entries.map((e) => e.name)).toEqual(['Oats', 'Chicken Rice']);
    expect(entries[1].portionMultiplier).toBe(1.5);
  });

  it('deletes an entry', async () => {
    const created = await addDiaryEntry(db, {
      date: '2026-07-02', mealSlot: 'snacks', foodItemId: null, name: 'Protein Bar',
      portionMultiplier: 1, calories: 200, protein: 20, carbs: 15, fat: 6,
    });
    await deleteDiaryEntry(db, created.id);
    expect(await getDiaryEntries(db, '2026-07-02')).toEqual([]);
  });
});

describe('day log', () => {
  it('returns defaults when no row exists yet', async () => {
    expect(await getDayLog(db, '2026-07-02')).toEqual({ date: '2026-07-02', waterL: 0, isGymDay: true });
  });

  it('upserts partial patches without clobbering the other field', async () => {
    await upsertDayLog(db, '2026-07-02', { waterL: 1.5 });
    await upsertDayLog(db, '2026-07-02', { isGymDay: false });
    expect(await getDayLog(db, '2026-07-02')).toEqual({ date: '2026-07-02', waterL: 1.5, isGymDay: false });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test`
Expected: FAIL — the new exports don't exist in `@/db/queries` yet.

- [ ] **Step 3: Implement**

Add imports to the top of `src/db/queries.ts` (extend the existing `drizzle-orm` import and `./schema` import — do not duplicate the import statements, merge into the existing ones):

```ts
import { and, desc, eq, ilike, isNotNull, max, sql } from 'drizzle-orm';
```

Add to the existing `import * as schema from './schema';` line — no change needed, `schema.foodItems` etc. are already reachable via the namespace import.

Append to `src/db/queries.ts`:

```ts
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
  const recentIds = await db
    .select({ foodItemId: schema.diaryEntries.foodItemId, lastLoggedAt: max(schema.diaryEntries.loggedAt) })
    .from(schema.diaryEntries)
    .where(isNotNull(schema.diaryEntries.foodItemId))
    .groupBy(schema.diaryEntries.foodItemId)
    .orderBy(desc(max(schema.diaryEntries.loggedAt)))
    .limit(limit);

  if (recentIds.length === 0) return [];
  const ids = recentIds.map((r) => r.foodItemId as number);
  const rows = await db.select().from(schema.foodItems).where(sql`${schema.foodItems.id} IN ${ids}`);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is typeof rows[number] => !!r).map(toFoodItem);
}

export async function createFoodItem(
  db: DB,
  item: Omit<FoodItem, 'id' | 'isFavorite'>,
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
```

Note: `and` is imported above but may not end up used depending on your exact query construction — if TypeScript/ESLint flags an unused import after writing this, remove `and` from the import list rather than leaving it unused.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test`
Expected: all pass (existing + new `queries-food.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: food item, diary entry, and day log queries"
```

---

### Task 4: Seed script and curated food data

**Files:**
- Create: `scripts/seed-food-data.json`, `scripts/seed-food.ts`
- Modify: `package.json` (add `db:seed` script)

**Interfaces:**
- Consumes: `createFoodItem` from `@/db/queries` (Task 3), `db` from `@/db`.
- Produces: `npm run db:seed` — idempotent (running twice does not duplicate rows; skips items whose exact `name` already exists).

- [ ] **Step 1: Write the seed data**

Create `scripts/seed-food-data.json`:

```json
[
  { "name": "Chicken Rice (1 plate)", "portionLabel": "1 plate", "kcal": 600, "protein": 35, "carbs": 70, "fat": 18 },
  { "name": "Bak Chor Mee (1 bowl)", "portionLabel": "1 bowl", "kcal": 520, "protein": 22, "carbs": 65, "fat": 16 },
  { "name": "Cai Fan - 2 veg 1 meat", "portionLabel": "1 plate", "kcal": 550, "protein": 28, "carbs": 60, "fat": 20 },
  { "name": "Laksa (1 bowl)", "portionLabel": "1 bowl", "kcal": 620, "protein": 20, "carbs": 55, "fat": 35 },
  { "name": "Mee Goreng (1 plate)", "portionLabel": "1 plate", "kcal": 580, "protein": 18, "carbs": 75, "fat": 22 },
  { "name": "Nasi Lemak (1 packet)", "portionLabel": "1 packet", "kcal": 650, "protein": 20, "carbs": 80, "fat": 25 },
  { "name": "Roti Prata (2 pcs, plain)", "portionLabel": "2 pcs", "kcal": 360, "protein": 8, "carbs": 45, "fat": 16 },
  { "name": "Char Kway Teow (1 plate)", "portionLabel": "1 plate", "kcal": 740, "protein": 20, "carbs": 85, "fat": 35 },
  { "name": "Hokkien Mee (1 plate)", "portionLabel": "1 plate", "kcal": 600, "protein": 25, "carbs": 65, "fat": 25 },
  { "name": "Chwee Kueh (5 pcs)", "portionLabel": "5 pcs", "kcal": 280, "protein": 6, "carbs": 40, "fat": 10 },
  { "name": "Fishball Noodle Soup", "portionLabel": "1 bowl", "kcal": 400, "protein": 22, "carbs": 55, "fat": 8 },
  { "name": "Wanton Mee (dry)", "portionLabel": "1 bowl", "kcal": 550, "protein": 24, "carbs": 65, "fat": 18 },
  { "name": "Economic Beehoon - 2 veg 1 meat", "portionLabel": "1 plate", "kcal": 480, "protein": 24, "carbs": 55, "fat": 16 },
  { "name": "Satay Chicken (5 sticks)", "portionLabel": "5 sticks", "kcal": 350, "protein": 30, "carbs": 15, "fat": 18 },
  { "name": "Curry Chicken with Rice", "portionLabel": "1 plate", "kcal": 700, "protein": 32, "carbs": 75, "fat": 28 },
  { "name": "Kopi (with condensed milk)", "portionLabel": "1 cup", "kcal": 120, "protein": 2, "carbs": 18, "fat": 4 },
  { "name": "Kopi O Kosong", "portionLabel": "1 cup", "kcal": 5, "protein": 0, "carbs": 1, "fat": 0 },
  { "name": "Teh C", "portionLabel": "1 cup", "kcal": 130, "protein": 3, "carbs": 20, "fat": 4 },
  { "name": "Bubble Tea (brown sugar, 50% sugar)", "portionLabel": "1 cup", "kcal": 380, "protein": 3, "carbs": 75, "fat": 8 },
  { "name": "Milo Peng", "portionLabel": "1 cup", "kcal": 180, "protein": 4, "carbs": 32, "fat": 5 },
  { "name": "Aston's Chicken Chop", "portionLabel": "1 set", "kcal": 750, "protein": 45, "carbs": 55, "fat": 38 },
  { "name": "Grilled Chicken Breast (plain)", "portionLabel": "150g", "kcal": 250, "protein": 47, "carbs": 0, "fat": 6 },
  { "name": "Steamed White Rice", "portionLabel": "1 cup cooked", "kcal": 205, "protein": 4, "carbs": 45, "fat": 0 },
  { "name": "Brown Rice (cooked)", "portionLabel": "1 cup", "kcal": 215, "protein": 5, "carbs": 45, "fat": 2 },
  { "name": "Rolled Oats (dry, cooked with water)", "portionLabel": "50g dry", "kcal": 190, "protein": 7, "carbs": 33, "fat": 3 },
  { "name": "Whole Eggs (boiled)", "portionLabel": "2 large", "kcal": 155, "protein": 13, "carbs": 1, "fat": 11 },
  { "name": "Egg Whites", "portionLabel": "3 large", "kcal": 50, "protein": 11, "carbs": 1, "fat": 0 },
  { "name": "Greek Yogurt (plain, nonfat)", "portionLabel": "170g", "kcal": 100, "protein": 18, "carbs": 6, "fat": 0 },
  { "name": "Whey Protein Shake (1 scoop, water)", "portionLabel": "1 scoop", "kcal": 120, "protein": 24, "carbs": 3, "fat": 1 },
  { "name": "Banana", "portionLabel": "1 medium", "kcal": 105, "protein": 1, "carbs": 27, "fat": 0 },
  { "name": "Apple", "portionLabel": "1 medium", "kcal": 95, "protein": 0, "carbs": 25, "fat": 0 },
  { "name": "Almonds (raw)", "portionLabel": "28g / small handful", "kcal": 160, "protein": 6, "carbs": 6, "fat": 14 },
  { "name": "Peanut Butter", "portionLabel": "2 tbsp", "kcal": 190, "protein": 8, "carbs": 7, "fat": 16 },
  { "name": "Avocado", "portionLabel": "1/2 medium", "kcal": 120, "protein": 1, "carbs": 6, "fat": 11 },
  { "name": "Salmon Fillet (grilled, plain)", "portionLabel": "150g", "kcal": 310, "protein": 34, "carbs": 0, "fat": 19 },
  { "name": "Lean Beef Mince (cooked, 90/10)", "portionLabel": "150g", "kcal": 270, "protein": 34, "carbs": 0, "fat": 14 },
  { "name": "Tofu (firm, plain)", "portionLabel": "150g", "kcal": 120, "protein": 13, "carbs": 3, "fat": 7 },
  { "name": "Sweet Potato (baked)", "portionLabel": "1 medium", "kcal": 115, "protein": 2, "carbs": 27, "fat": 0 },
  { "name": "Broccoli (steamed)", "portionLabel": "1 cup", "kcal": 55, "protein": 4, "carbs": 11, "fat": 0 },
  { "name": "Mixed Salad with Olive Oil Dressing", "portionLabel": "1 bowl", "kcal": 220, "protein": 4, "carbs": 12, "fat": 18 },
  { "name": "Whole Wheat Bread", "portionLabel": "2 slices", "kcal": 160, "protein": 8, "carbs": 28, "fat": 2 },
  { "name": "Instant Noodles (with seasoning packet)", "portionLabel": "1 packet", "kcal": 385, "protein": 8, "carbs": 55, "fat": 15 },
  { "name": "Protein Bar (generic, ~20g protein)", "portionLabel": "1 bar", "kcal": 220, "protein": 20, "carbs": 22, "fat": 8 },
  { "name": "Milk (full cream)", "portionLabel": "250ml", "kcal": 150, "protein": 8, "carbs": 12, "fat": 8 },
  { "name": "Milk (skim)", "portionLabel": "250ml", "kcal": 90, "protein": 9, "carbs": 12, "fat": 0 },
  { "name": "Cheese Slice", "portionLabel": "1 slice", "kcal": 70, "protein": 4, "carbs": 1, "fat": 6 },
  { "name": "French Fries (medium)", "portionLabel": "1 medium serving", "kcal": 365, "protein": 4, "carbs": 48, "fat": 17 },
  { "name": "Cheeseburger (fast food)", "portionLabel": "1 burger", "kcal": 500, "protein": 25, "carbs": 40, "fat": 25 },
  { "name": "Ice Kacang", "portionLabel": "1 bowl", "kcal": 300, "protein": 3, "carbs": 65, "fat": 4 },
  { "name": "Dark Chocolate (70%+)", "portionLabel": "20g", "kcal": 115, "protein": 2, "carbs": 9, "fat": 8 }
]
```

- [ ] **Step 2: Write the seed script**

Create `scripts/seed-food.ts`:

```ts
import { readFileSync } from 'fs';
import { join } from 'path';
import { eq } from 'drizzle-orm';
import { db } from '../src/db';
import { foodItems } from '../src/db/schema';

interface SeedItem {
  name: string;
  portionLabel: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

async function main() {
  const raw = readFileSync(join(__dirname, 'seed-food-data.json'), 'utf-8');
  const items: SeedItem[] = JSON.parse(raw);

  let inserted = 0;
  let skipped = 0;

  for (const item of items) {
    const existing = await db.select().from(foodItems).where(eq(foodItems.name, item.name));
    if (existing.length > 0) {
      skipped += 1;
      continue;
    }
    await db.insert(foodItems).values({ ...item, isCustom: false, isFavorite: false });
    inserted += 1;
  }

  console.log(`Seed complete: ${inserted} inserted, ${skipped} already present.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
```

- [ ] **Step 3: Add the npm script**

Edit `package.json`, add to `"scripts"`:

```json
"db:seed": "tsx scripts/seed-food.ts"
```

Install `tsx` if not already present:

```bash
npm install -D tsx
```

- [ ] **Step 4: Run it against a real database and verify idempotency**

This requires `DATABASE_URL` to point at your Neon database (same `.env.local` used in Phase 1). Run:

```bash
set -a && source .env.local && set +a && npm run db:seed
```

Expected: `Seed complete: 50 inserted, 0 already present.`

Run it again immediately:

```bash
set -a && source .env.local && set +a && npm run db:seed
```

Expected: `Seed complete: 0 inserted, 50 already present.`

- [ ] **Step 5: Commit**

```bash
git add scripts/ package.json package-lock.json
git commit -m "feat: curated food seed data and idempotent seed script"
```

---

### Task 5: Validation schemas for food/diary/day-log routes

**Files:**
- Modify: `src/lib/validate.ts`
- Test: `tests/validate-food.test.ts`

**Interfaces:**
- Consumes: `DateString` (already in `validate.ts`), `MEAL_SLOTS` from `@/lib/food` (Task 2).
- Produces (appended to `src/lib/validate.ts`):
  - `CreateFoodItemBody` — `{ name: string (1-100 chars), portionLabel: string (1-50 chars), kcal: number (0-5000), protein: number (0-500), carbs: number (0-500), fat: number (0-500) }`
  - `AddDiaryEntryBody` — `{ date: DateString, mealSlot: enum of MEAL_SLOTS, foodItemId: number.int().positive().nullable(), name: string (1-100 chars), portionMultiplier: number (0.1-10), calories: number (0-5000), protein: number (0-500), carbs: number (0-500), fat: number (0-500) }`
  - `SetFavoriteBody` — `{ isFavorite: boolean }`
  - `DayLogPatchBody` — `{ date: DateString, waterL: number (0-10).optional(), isGymDay: boolean.optional() }`

- [ ] **Step 1: Write failing tests**

Create `tests/validate-food.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CreateFoodItemBody, AddDiaryEntryBody, SetFavoriteBody, DayLogPatchBody } from '@/lib/validate';

describe('CreateFoodItemBody', () => {
  const valid = { name: 'Chicken Rice', portionLabel: '1 plate', kcal: 600, protein: 35, carbs: 70, fat: 18 };
  it('accepts a valid item', () => expect(CreateFoodItemBody.safeParse(valid).success).toBe(true));
  it('rejects empty name and out-of-range macros', () => {
    expect(CreateFoodItemBody.safeParse({ ...valid, name: '' }).success).toBe(false);
    expect(CreateFoodItemBody.safeParse({ ...valid, kcal: 9999 }).success).toBe(false);
    expect(CreateFoodItemBody.safeParse({ ...valid, protein: -1 }).success).toBe(false);
  });
});

describe('AddDiaryEntryBody', () => {
  const valid = {
    date: '2026-07-02', mealSlot: 'lunch', foodItemId: 1, name: 'Chicken Rice',
    portionMultiplier: 1, calories: 600, protein: 35, carbs: 70, fat: 18,
  };
  it('accepts a valid entry with a food item id', () => expect(AddDiaryEntryBody.safeParse(valid).success).toBe(true));
  it('accepts a null food item id for manual entries', () => {
    expect(AddDiaryEntryBody.safeParse({ ...valid, foodItemId: null }).success).toBe(true);
  });
  it('rejects an invalid meal slot and out-of-range portion multiplier', () => {
    expect(AddDiaryEntryBody.safeParse({ ...valid, mealSlot: 'brunch' }).success).toBe(false);
    expect(AddDiaryEntryBody.safeParse({ ...valid, portionMultiplier: 0 }).success).toBe(false);
    expect(AddDiaryEntryBody.safeParse({ ...valid, portionMultiplier: 20 }).success).toBe(false);
  });
});

describe('SetFavoriteBody', () => {
  it('accepts a boolean and rejects non-booleans', () => {
    expect(SetFavoriteBody.safeParse({ isFavorite: true }).success).toBe(true);
    expect(SetFavoriteBody.safeParse({ isFavorite: 'yes' }).success).toBe(false);
  });
});

describe('DayLogPatchBody', () => {
  it('accepts a date-only patch and a full patch', () => {
    expect(DayLogPatchBody.safeParse({ date: '2026-07-02' }).success).toBe(true);
    expect(DayLogPatchBody.safeParse({ date: '2026-07-02', waterL: 1.5, isGymDay: false }).success).toBe(true);
  });
  it('rejects water out of range', () => {
    expect(DayLogPatchBody.safeParse({ date: '2026-07-02', waterL: -1 }).success).toBe(false);
    expect(DayLogPatchBody.safeParse({ date: '2026-07-02', waterL: 20 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test`
Expected: FAIL — new exports don't exist yet.

- [ ] **Step 3: Implement**

Append to `src/lib/validate.ts` (add `import { MEAL_SLOTS } from './food';` to the top alongside the existing imports):

```ts
export const CreateFoodItemBody = z.object({
  name: z.string().min(1).max(100),
  portionLabel: z.string().min(1).max(50),
  kcal: z.number().min(0).max(5000),
  protein: z.number().min(0).max(500),
  carbs: z.number().min(0).max(500),
  fat: z.number().min(0).max(500),
});

export const AddDiaryEntryBody = z.object({
  date: DateString,
  mealSlot: z.enum(MEAL_SLOTS as [string, ...string[]]),
  foodItemId: z.number().int().positive().nullable(),
  name: z.string().min(1).max(100),
  portionMultiplier: z.number().min(0.1).max(10),
  calories: z.number().min(0).max(5000),
  protein: z.number().min(0).max(500),
  carbs: z.number().min(0).max(500),
  fat: z.number().min(0).max(500),
});

export const SetFavoriteBody = z.object({
  isFavorite: z.boolean(),
});

export const DayLogPatchBody = z.object({
  date: DateString,
  waterL: z.number().min(0).max(10).optional(),
  isGymDay: z.boolean().optional(),
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: validation schemas for food, diary, and day-log routes"
```

---

### Task 6: API routes — food items, diary, day log

**Files:**
- Create: `src/app/api/food-items/route.ts`, `src/app/api/food-items/[id]/route.ts`, `src/app/api/diary/route.ts`, `src/app/api/diary/[id]/route.ts`, `src/app/api/day/route.ts`

**Interfaces:**
- Consumes: all query functions from Task 3, validation schemas from Task 5, `db` from `@/db`.
- Produces (all JSON; errors `{ error: string }` with 400/404):
  - `GET /api/food-items?q=<text>` → `{ items: FoodItem[] }` (search; empty `items` if `q` missing/blank)
  - `GET /api/food-items?recent=1` → `{ items: FoodItem[] }`
  - `GET /api/food-items?favorite=1` → `{ items: FoodItem[] }`
  - `POST /api/food-items` body = `CreateFoodItemBody` → `{ item: FoodItem }`
  - `PATCH /api/food-items/[id]` body = `SetFavoriteBody` → `{ ok: true }`
  - `GET /api/diary?date=YYYY-MM-DD` → `{ entries: DiaryEntry[] }` (400 if `date` missing/malformed)
  - `POST /api/diary` body = `AddDiaryEntryBody` → `{ entries: DiaryEntry[] }` (fresh list for that entry's date)
  - `DELETE /api/diary/[id]?date=YYYY-MM-DD` → `{ entries: DiaryEntry[] }` (400 if `date` missing/malformed)
  - `GET /api/day?date=YYYY-MM-DD` → `DayLog` (400 if `date` missing/malformed)
  - `PUT /api/day` body = `DayLogPatchBody` → `DayLog`

- [ ] **Step 1: Implement `/api/food-items`**

Create `src/app/api/food-items/route.ts`:

```ts
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
```

- [ ] **Step 2: Implement `/api/food-items/[id]`**

Create `src/app/api/food-items/[id]/route.ts`:

```ts
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
```

- [ ] **Step 3: Implement `/api/diary`**

Create `src/app/api/diary/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { addDiaryEntry, getDiaryEntries } from '@/db/queries';
import { AddDiaryEntryBody, DateString } from '@/lib/validate';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') ?? '';
  if (!DateString.safeParse(date).success) {
    return NextResponse.json({ error: 'Missing or invalid date' }, { status: 400 });
  }
  return NextResponse.json({ entries: await getDiaryEntries(db, date) });
}

export async function POST(req: Request) {
  const parsed = AddDiaryEntryBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
  }
  await addDiaryEntry(db, parsed.data);
  return NextResponse.json({ entries: await getDiaryEntries(db, parsed.data.date) });
}
```

- [ ] **Step 4: Implement `/api/diary/[id]`**

Create `src/app/api/diary/[id]/route.ts`:

```ts
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
```

- [ ] **Step 5: Implement `/api/day`**

Create `src/app/api/day/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { getDayLog, upsertDayLog } from '@/db/queries';
import { DateString, DayLogPatchBody } from '@/lib/validate';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') ?? '';
  if (!DateString.safeParse(date).success) {
    return NextResponse.json({ error: 'Missing or invalid date' }, { status: 400 });
  }
  return NextResponse.json(await getDayLog(db, date));
}

export async function PUT(req: Request) {
  const parsed = DayLogPatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
  }
  const { date, ...patch } = parsed.data;
  return NextResponse.json(await upsertDayLog(db, date, patch));
}
```

- [ ] **Step 6: Verify build**

Run: `npm run test` → all pass.
Run: `npm run build` → succeeds, lists `/api/food-items`, `/api/food-items/[id]`, `/api/diary`, `/api/diary/[id]`, `/api/day`.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: food item, diary, and day-log API routes"
```

---

### Task 7: Today page — summary card wired to real data

**Files:**
- Create: `src/components/today/DaySummary.tsx`
- Modify: `src/app/(app)/today/page.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `Targets` from `@/lib/targets`; `DayLog` shape (matches `@/db/queries`'s `DayLog`); `Macros`, `sumEntries` from `@/lib/food`; `todayLocalISO` from `@/lib/dates`.
- Produces: `TodayPage` fetches `/api/targets`, `/api/day?date=<today>`, `/api/diary?date=<today>` in parallel on mount and holds them in state; passes derived values down to `DaySummary`. Later tasks (8, 9) add sibling components to the same page — this task only wires the top summary card, and the page structure it establishes (state shape, `reload()` function) is what Tasks 8-9 build on.

- [ ] **Step 1: Implement `DaySummary`**

Create `src/components/today/DaySummary.tsx`:

```tsx
'use client';

import type { Targets } from '@/lib/targets';
import type { Macros } from '@/lib/food';

const barColor = { protein: '#34d399', carbs: '#fbbf24', fat: '#f472b6' } as const;

function MacroBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100);
  const over = value > max;
  return (
    <div className="mb-2">
      <div className="mb-0.5 flex justify-between text-[11px] uppercase tracking-wider text-gray-500">
        <span>{label}</span>
        <span className={over ? 'text-red-400' : 'text-gray-200'}>
          {Math.round(value)}g <span className="text-gray-500">/ {Math.round(max)}g</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-gray-800">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${pct}%`, background: over ? '#f87171' : color }}
        />
      </div>
    </div>
  );
}

export default function DaySummary({
  totals,
  targets,
  isGymDay,
  waterL,
  onToggleGymDay,
  onWaterChange,
}: {
  totals: Macros;
  targets: Targets;
  isGymDay: boolean;
  waterL: number;
  onToggleGymDay: (v: boolean) => void;
  onWaterChange: (v: number) => void;
}) {
  const calorieTarget = isGymDay ? targets.caloriesGym : targets.caloriesRest;
  const carbsMax = isGymDay ? targets.carbsGymMax : targets.carbsRestMax;
  const remaining = calorieTarget - totals.calories;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          onClick={() => onToggleGymDay(true)}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold ${isGymDay ? 'bg-blue-700 text-white' : 'bg-gray-800 text-gray-500'}`}
        >
          Gym Day
        </button>
        <button
          onClick={() => onToggleGymDay(false)}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold ${!isGymDay ? 'bg-blue-700 text-white' : 'bg-gray-800 text-gray-500'}`}
        >
          Rest Day
        </button>
      </div>

      <div className="rounded-xl border border-blue-900/60 bg-[#0f172a] p-4">
        <div className="mb-4 flex justify-around">
          <div className="text-center">
            <div className={`text-2xl font-extrabold tracking-tight ${totals.calories > calorieTarget ? 'text-red-400' : 'text-blue-400'}`}>
              {Math.round(totals.calories)}
            </div>
            <div className="mt-0.5 text-[10px] uppercase tracking-wider text-gray-500">kcal eaten</div>
          </div>
          <div className="w-px bg-blue-900/60" />
          <div className="text-center">
            <div className={`text-2xl font-extrabold tracking-tight ${remaining < 0 ? 'text-red-400' : 'text-gray-300'}`}>
              {Math.abs(Math.round(remaining))}
            </div>
            <div className="mt-0.5 text-[10px] uppercase tracking-wider text-gray-500">{remaining < 0 ? 'over' : 'left'}</div>
          </div>
          <div className="w-px bg-blue-900/60" />
          <div className="text-center">
            <div className="text-2xl font-extrabold tracking-tight text-gray-300">{calorieTarget}</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-wider text-gray-500">target</div>
          </div>
        </div>

        <MacroBar label="Protein" value={totals.protein} max={targets.protein} color={barColor.protein} />
        <MacroBar label="Carbs" value={totals.carbs} max={carbsMax} color={barColor.carbs} />
        <MacroBar label="Fat" value={totals.fat} max={targets.fatMax} color={barColor.fat} />

        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[11px] uppercase tracking-wider text-gray-500">
            <span>Water</span>
            <span className={waterL >= targets.water ? 'text-emerald-400' : 'text-gray-200'}>
              {waterL}L / {targets.water}L
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onWaterChange(Math.max(0, waterL - 0.25))}
              className="rounded-lg bg-gray-800 px-3 py-1 text-sm text-gray-200"
            >
              −
            </button>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-800">
              <div
                className="h-full rounded-full bg-sky-400 transition-[width] duration-300"
                style={{ width: `${Math.min((waterL / targets.water) * 100, 100)}%` }}
              />
            </div>
            <button
              onClick={() => onWaterChange(waterL + 0.25)}
              className="rounded-lg bg-gray-800 px-3 py-1 text-sm text-gray-200"
            >
              +
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire up the Today page**

Replace `src/app/(app)/today/page.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Targets } from '@/lib/targets';
import type { DayLog } from '@/db/queries';
import { sumEntries, type DiaryEntry } from '@/lib/food';
import { todayLocalISO } from '@/lib/dates';
import DaySummary from '@/components/today/DaySummary';

export default function TodayPage() {
  const today = todayLocalISO();
  const [targets, setTargets] = useState<Targets | null>(null);
  const [dayLog, setDayLog] = useState<DayLog | null>(null);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [t, d, e] = await Promise.all([
      fetch('/api/targets').then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/day?date=${today}`).then((r) => r.json()),
      fetch(`/api/diary?date=${today}`).then((r) => r.json()),
    ]);
    setTargets(t?.effective ?? null);
    setDayLog(d);
    setEntries(e.entries);
    setLoading(false);
  }, [today]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void reload(); }, [reload]);

  async function toggleGymDay(isGymDay: boolean) {
    const updated = await fetch('/api/day', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: today, isGymDay }),
    }).then((r) => r.json());
    setDayLog(updated);
  }

  async function changeWater(waterL: number) {
    const updated = await fetch('/api/day', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: today, waterL }),
    }).then((r) => r.json());
    setDayLog(updated);
  }

  if (loading || !targets || !dayLog) {
    return <div className="p-6 text-sm text-gray-500">Loading…</div>;
  }

  const totals = sumEntries(entries);

  return (
    <div className="space-y-5 p-5">
      <h1 className="text-xl font-bold text-gray-50">Today</h1>
      <DaySummary
        totals={totals}
        targets={targets}
        isGymDay={dayLog.isGymDay}
        waterL={dayLog.waterL}
        onToggleGymDay={toggleGymDay}
        onWaterChange={changeWater}
      />
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npm run test` → all pass. Run: `npm run build` → succeeds.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: today page summary card wired to targets, day log, and diary totals"
```

---

### Task 8: Food logging UI — search, manual entry, recents/favourites

**Files:**
- Create: `src/components/today/FoodLogger.tsx`
- Modify: `src/app/(app)/today/page.tsx` (add `FoodLogger`, extend `reload`/state as needed)

**Interfaces:**
- Consumes: `FoodItem` shape (matches `@/db/queries`'s `FoodItem`), `MEAL_SLOTS` and `MealSlot` from `@/lib/food`, `todayLocalISO` from `@/lib/dates`.
- Produces: `FoodLogger` component that, on a successful log, calls the `onLogged: () => Promise<void>` prop (the Today page's `reload`) so the summary and entry list (Task 9) reflect the new entry immediately.

- [ ] **Step 1: Implement `FoodLogger`**

Create `src/components/today/FoodLogger.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { FoodItem } from '@/db/queries';
import { MEAL_SLOTS, type MealSlot } from '@/lib/food';
import { todayLocalISO } from '@/lib/dates';

const inputCls = 'w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-50 outline-none focus:border-blue-500';

function defaultMealSlot(): MealSlot {
  const hour = new Date().getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snacks';
}

export default function FoodLogger({ onLogged }: { onLogged: () => Promise<void> }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodItem[]>([]);
  const [shortcuts, setShortcuts] = useState<FoodItem[]>([]);
  const [selected, setSelected] = useState<FoodItem | null>(null);
  const [multiplier, setMultiplier] = useState('1');
  const [mealSlot, setMealSlot] = useState<MealSlot>(defaultMealSlot());
  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState({ name: '', kcal: '', protein: '', carbs: '', fat: '' });
  const [status, setStatus] = useState('');

  useEffect(() => {
    (async () => {
      const [recent, favorite] = await Promise.all([
        fetch('/api/food-items?recent=1').then((r) => r.json()),
        fetch('/api/food-items?favorite=1').then((r) => r.json()),
      ]);
      const seen = new Set<number>();
      const merged: FoodItem[] = [];
      for (const item of [...favorite.items, ...recent.items]) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          merged.push(item);
        }
      }
      setShortcuts(merged.slice(0, 8));
    })();
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      const res = await fetch(`/api/food-items?q=${encodeURIComponent(q)}`).then((r) => r.json());
      setResults(res.items);
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  async function logSelected() {
    if (!selected) return;
    const m = parseFloat(multiplier) || 1;
    const res = await fetch('/api/diary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: todayLocalISO(),
        mealSlot,
        foodItemId: selected.id,
        name: selected.name,
        portionMultiplier: m,
        calories: selected.kcal * m,
        protein: selected.protein * m,
        carbs: selected.carbs * m,
        fat: selected.fat * m,
      }),
    });
    if (res.ok) {
      setSelected(null);
      setQuery('');
      setMultiplier('1');
      setStatus(`Logged ${selected.name}`);
      setTimeout(() => setStatus(''), 2000);
      await onLogged();
    } else {
      setStatus('Log failed — try again');
    }
  }

  async function logManual() {
    const kcal = parseFloat(manual.kcal) || 0;
    const protein = parseFloat(manual.protein) || 0;
    const carbs = parseFloat(manual.carbs) || 0;
    const fat = parseFloat(manual.fat) || 0;
    if (!manual.name.trim() || kcal <= 0) return;

    const item = await fetch('/api/food-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: manual.name.trim(), portionLabel: 'custom', kcal, protein, carbs, fat }),
    }).then((r) => r.json());

    const res = await fetch('/api/diary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: todayLocalISO(),
        mealSlot,
        foodItemId: item.item.id,
        name: item.item.name,
        portionMultiplier: 1,
        calories: kcal,
        protein,
        carbs,
        fat,
      }),
    });
    if (res.ok) {
      setManual({ name: '', kcal: '', protein: '', carbs: '', fat: '' });
      setShowManual(false);
      setStatus(`Logged ${item.item.name}`);
      setTimeout(() => setStatus(''), 2000);
      await onLogged();
    } else {
      setStatus('Log failed — try again');
    }
  }

  return (
    <div className="rounded-xl bg-gray-900 p-4">
      <div className="mb-2 text-[11px] uppercase tracking-wider text-gray-500">Log food</div>

      <div className="mb-3 flex gap-1.5">
        {MEAL_SLOTS.map((slot) => (
          <button
            key={slot}
            onClick={() => setMealSlot(slot)}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold capitalize ${
              mealSlot === slot ? 'bg-blue-700 text-white' : 'bg-gray-800 text-gray-500'
            }`}
          >
            {slot}
          </button>
        ))}
      </div>

      {shortcuts.length > 0 && !query && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {shortcuts.map((item) => (
            <button
              key={item.id}
              onClick={() => { setSelected(item); setMultiplier('1'); }}
              className="rounded-full border border-gray-700 bg-gray-800 px-3 py-1 text-xs text-gray-300"
            >
              {item.isFavorite ? '★ ' : ''}{item.name}
            </button>
          ))}
        </div>
      )}

      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
        placeholder="Search food…"
        className={`${inputCls} mb-2`}
      />

      {results.length > 0 && !selected && (
        <div className="mb-2 divide-y divide-gray-800 rounded-lg border border-gray-800">
          {results.map((item) => (
            <button
              key={item.id}
              onClick={() => { setSelected(item); setMultiplier('1'); setQuery(item.name); }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-gray-200"
            >
              <span>{item.name}</span>
              <span className="text-xs text-gray-500">{item.kcal} kcal / {item.portionLabel}</span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-gray-800 p-2.5">
          <div className="flex-1 text-sm text-gray-200">{selected.name}</div>
          <input
            type="number"
            inputMode="decimal"
            step="0.5"
            min="0.1"
            value={multiplier}
            onChange={(e) => setMultiplier(e.target.value)}
            className="w-16 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-right text-sm text-gray-50"
          />
          <span className="text-xs text-gray-500">× portion</span>
          <button onClick={logSelected} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white">
            Log
          </button>
        </div>
      )}

      <button onClick={() => setShowManual((s) => !s)} className="text-xs text-gray-500 underline">
        {showManual ? 'Cancel manual entry' : "Can't find it? Enter manually"}
      </button>

      {showManual && (
        <div className="mt-2 space-y-2 rounded-lg bg-gray-800 p-3">
          <input
            value={manual.name}
            onChange={(e) => setManual((m) => ({ ...m, name: e.target.value }))}
            placeholder="Food name"
            className={inputCls}
          />
          <div className="grid grid-cols-4 gap-2">
            <input value={manual.kcal} onChange={(e) => setManual((m) => ({ ...m, kcal: e.target.value }))} placeholder="kcal" type="number" className={inputCls} />
            <input value={manual.protein} onChange={(e) => setManual((m) => ({ ...m, protein: e.target.value }))} placeholder="protein" type="number" className={inputCls} />
            <input value={manual.carbs} onChange={(e) => setManual((m) => ({ ...m, carbs: e.target.value }))} placeholder="carbs" type="number" className={inputCls} />
            <input value={manual.fat} onChange={(e) => setManual((m) => ({ ...m, fat: e.target.value }))} placeholder="fat" type="number" className={inputCls} />
          </div>
          <button onClick={logManual} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white">
            Log Manual Entry
          </button>
        </div>
      )}

      {status && <p className="mt-2 text-xs text-emerald-400">{status}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Add `FoodLogger` to the Today page**

Edit `src/app/(app)/today/page.tsx` — add the import and render it below `DaySummary`:

```ts
import FoodLogger from '@/components/today/FoodLogger';
```

```tsx
      <DaySummary
        totals={totals}
        targets={targets}
        isGymDay={dayLog.isGymDay}
        waterL={dayLog.waterL}
        onToggleGymDay={toggleGymDay}
        onWaterChange={changeWater}
      />
      <FoodLogger onLogged={reload} />
```

- [ ] **Step 3: Verify**

Run: `npm run test` → all pass. Run: `npm run build` → succeeds.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: food logging UI with search, recents/favourites, and manual entry"
```

---

### Task 9: Entry list grouped by meal slot, with delete

**Files:**
- Create: `src/components/today/EntryList.tsx`
- Modify: `src/app/(app)/today/page.tsx` (add `EntryList`)

**Interfaces:**
- Consumes: `DiaryEntry`, `groupByMealSlot`, `MEAL_SLOTS` from `@/lib/food`.
- Produces: `EntryList` renders all four meal slots (skipping empty ones in the UI, per the spec's "listed by meal slot" — an empty slot section simply doesn't render) with a delete button per entry, calling `onDeleted: () => Promise<void>` (the page's `reload`) after a successful delete.

- [ ] **Step 1: Implement `EntryList`**

Create `src/components/today/EntryList.tsx`:

```tsx
'use client';

import { MEAL_SLOTS, groupByMealSlot, type DiaryEntry } from '@/lib/food';
import { todayLocalISO } from '@/lib/dates';

const SLOT_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
};

export default function EntryList({
  entries,
  onDeleted,
}: {
  entries: DiaryEntry[];
  onDeleted: () => Promise<void>;
}) {
  const grouped = groupByMealSlot(entries);

  async function handleDelete(id: number) {
    const res = await fetch(`/api/diary/${id}?date=${todayLocalISO()}`, { method: 'DELETE' });
    if (res.ok) await onDeleted();
  }

  const hasAny = entries.length > 0;
  if (!hasAny) return null;

  return (
    <div className="space-y-4">
      {MEAL_SLOTS.filter((slot) => grouped[slot].length > 0).map((slot) => (
        <div key={slot}>
          <div className="mb-1.5 text-[11px] uppercase tracking-wider text-gray-500">{SLOT_LABELS[slot]}</div>
          <div className="space-y-1.5">
            {grouped[slot].map((entry) => (
              <div key={entry.id} className="flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-gray-200">{entry.name}</div>
                  {entry.portionMultiplier !== 1 && (
                    <div className="text-[11px] text-gray-500">×{entry.portionMultiplier} portion</div>
                  )}
                </div>
                <div className="flex flex-shrink-0 gap-2.5 text-xs text-gray-400">
                  <span className="font-semibold text-gray-50">{Math.round(entry.calories)}</span>
                  <span>{Math.round(entry.protein)}p</span>
                  <span>{Math.round(entry.carbs)}c</span>
                  <span>{Math.round(entry.fat)}f</span>
                </div>
                <button onClick={() => handleDelete(entry.id)} className="flex-shrink-0 px-1 text-gray-600">
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add `EntryList` to the Today page**

Edit `src/app/(app)/today/page.tsx` — add the import and render below `FoodLogger`:

```ts
import EntryList from '@/components/today/EntryList';
```

```tsx
      <FoodLogger onLogged={reload} />
      <EntryList entries={entries} onDeleted={reload} />
```

- [ ] **Step 3: Verify**

Run: `npm run test` → all pass. Run: `npm run build` → succeeds.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: today page entry list grouped by meal slot with delete"
```

---

### Task 10: End-to-end verification against real database

**Files:** none created — verification task.

**Interfaces:**
- Consumes: everything above, plus the existing `DATABASE_URL` in `.env.local` (Neon), the existing dev password.

- [ ] **Step 1: Migrate and seed**

```bash
cd "/Users/darryltan/Calorie App"
set -a && source .env.local && set +a
npm run db:migrate
npm run db:seed
```

Expected: migration applies the three new tables; seed reports 50 inserted (or 0 inserted / 50 present if already run in Task 4).

- [ ] **Step 2: Walk the flows via curl**

Start `npm run dev`, log in, then (persist cookies with `-c /tmp/cj -b /tmp/cj`):

1. `GET /api/food-items?q=chicken` → several chicken items, favorites-first ordering if any are favorited.
2. `POST /api/food-items/[an id from step 1]` — actually `PATCH .../food-items/<id>` with `{"isFavorite": true}` → `{"ok":true}`.
3. `GET /api/food-items?favorite=1` → includes the item just favorited.
4. `POST /api/diary` with a valid body (real `foodItemId` from step 1, today's date) → `{"entries": [...]}` including the new entry.
5. `GET /api/day?date=<today>` → defaults `{"date":"<today>","waterL":0,"isGymDay":true}` if not yet touched today.
6. `PUT /api/day` `{"date":"<today>","waterL":1.5}` → `{"date":"<today>","waterL":1.5,"isGymDay":true}`.
7. `GET /api/food-items?recent=1` → includes the item logged in step 4.
8. `DELETE /api/diary/<id from step 4>?date=<today>` → `{"entries":[]}` (or without that entry).

- [ ] **Step 3: Browser walkthrough**

In a browser (or the preview tooling), confirm on the Today tab: gym/rest toggle persists across reload, water +/- buttons work and persist, food search returns results and logging updates the summary and entry list immediately, recents/favourites chips work, manual entry works and the manually-entered food becomes searchable afterward (proving it was saved as a reusable `food_items` row), delete removes an entry and updates the summary.

- [ ] **Step 4: Fix anything found, run full suite, commit if changed**

```bash
npm run test && npm run build
```

Only commit if fixes were made:

```bash
git add -A && git commit -m "test: verified end-to-end food logging flows against real Postgres"
```

- [ ] **Step 5: Deploy**

```bash
git push origin main
npx vercel --prod --yes
```

Re-run the curl checks from Step 2 against the production URL to confirm the deploy is healthy (same pattern as Phase 1 Task 9 — watch for the same class of "build succeeded but routes 404" failure mode; if it recurs, re-check `npx vercel project inspect calorie-tracker` for `Framework Preset`).

---

## Done means

- `npm run test` green; `npm run build` green.
- Today tab live in production: gym/rest toggle, water tracker, calorie/macro summary all wired to real data.
- Food logging works via search (seeded + custom items), recents/favourites shortcuts, and manual entry (which becomes a reusable searchable item).
- Diary entries are listed grouped by meal slot and can be deleted.
- All of the above persists in Neon and is reachable from both a phone and a desktop browser against the same account.
