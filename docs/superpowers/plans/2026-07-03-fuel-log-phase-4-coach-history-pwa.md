# Fuel Log Phase 4: Coach Reviews, History, and PWA Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working Coach tab (generate a weekly review with weight trend, adherence %, workout completion, and a rule-based calorie recommendation you can apply), a working History tab (reverse-chronological day list with adherence badges, tap-to-expand), and installable-on-iPhone PWA basics (manifest + icons).

**Architecture:** Same as Phases 1-3 — pure functions in `src/lib` for the review engine and a small date-arithmetic helper, thin `src/db/queries.ts` additions (date-range queries + weekly_reviews CRUD), Next.js API routes, React client components. No AI in this phase.

**Tech Stack:** Same as prior phases. PWA icons use Next.js's built-in `icon.tsx`/`apple-icon.tsx`/`manifest.ts` file conventions (auto-generated PNGs via `next/og`, no new dependency, no external image assets needed).

**Spec:** `docs/superpowers/specs/2026-07-02-fuel-log-app-design.md`, section 4.3 (Coach — weekly review only, chat coach is AI-gated and out of scope), 4.4 (History), section 5 (`weekly_reviews` table), section 6 (weekly review engine), and section 3 (PWA). This is Phase 4 of 4 — the last phase of the originally-scoped app before any future AI work.

**Scope decisions (confirmed with user before writing this plan):**
1. Review thresholds (none of these are numerically specified in the source spec): weight trend computed as %/week from logged weigh-ins spanning the review's lookback window. `> -0.25%/week` counts as "flat" → recommend −125 kcal/day. `< -1%/week` counts as "losing too fast" → recommend +100 kcal/day. Between those → on track. Protein adherence averaging below 80% is flagged ahead of any calorie recommendation, regardless of weight trend. Fewer than 10 total logged days (over a 30-day lookback) → no recommendation yet.
2. The spec's calorie-adjustment rules are written for `fat_loss` only. `maintain` and `muscle_gain` still get full adherence/trend/workout stats, but always resolve to "on track" (no calorie-adjustment suggestion) — extending the rules to those goals is out of scope for this phase.
3. "Apply" always targets the most recently generated review (the one shown on the Coach page) — there's no UI for applying an older, previously-generated review from history.

## Global Constraints

- TypeScript strict mode; no `any` in committed code.
- Single-user app: no `user_id` columns anywhere.
- All dates are client-supplied `YYYY-MM-DD` strings via `todayLocalISO()` — never compute "today" server-side. Where a route needs to derive a date window (e.g., "7 days ago"), it does day-arithmetic on a client-supplied anchor date, not on a server-side `new Date()`.
- Dark theme only. Follow the exact Tailwind class patterns already used in `src/components/today/*.tsx`, `src/components/train/*.tsx`, and `src/components/profile/*.tsx`.
- Run `npm run test` before every commit; run `npm run build` before any task that touches routes/pages.
- Working directory for all commands: `/Users/darryltan/Calorie App`.
- Every DB-touching query function takes `db: DB` as its first argument, matching the existing pattern.

---

### Task 1: Schema — weekly_reviews

**Files:**
- Modify: `src/db/schema.ts`
- Create migration via `npm run db:generate`

**Interfaces:**
- Produces (new Drizzle table, importable from `@/db/schema`):
  - `weeklyReviews`: `id` (serial pk), `weekStart` (date, not null), `weightTrendPercent` (real, nullable), `calorieAdherencePercent` (real, not null), `proteinAdherencePercent` (real, not null), `workoutsCompleted` (integer, not null), `workoutsPlanned` (integer, not null), `recommendation` (jsonb, not null — `{ type, message, calorieAdjustment }`), `applied` (boolean, not null, default false), `createdAt` (timestamp, not null, default now).

- [ ] **Step 1: Append the table to schema.ts**

Read the current `src/db/schema.ts` first. Append (no new imports needed):

```ts
export const weeklyReviews = pgTable('weekly_reviews', {
  id: serial('id').primaryKey(),
  weekStart: date('week_start').notNull(),
  weightTrendPercent: real('weight_trend_percent'),
  calorieAdherencePercent: real('calorie_adherence_percent').notNull(),
  proteinAdherencePercent: real('protein_adherence_percent').notNull(),
  workoutsCompleted: integer('workouts_completed').notNull(),
  workoutsPlanned: integer('workouts_planned').notNull(),
  recommendation: jsonb('recommendation').notNull(),
  applied: boolean('applied').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: creates a new `drizzle/000X_*.sql` with one `CREATE TABLE` statement for `weekly_reviews`, with `weight_trend_percent` nullable and every other column `NOT NULL`.

- [ ] **Step 3: Run existing tests to confirm nothing broke**

Run: `npm run test`
Expected: all existing tests still pass (purely additive schema change).

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat: add weekly_reviews schema"
```

---

### Task 2: Review engine and date-arithmetic pure functions (TDD)

**Files:**
- Create: `src/lib/review.ts`
- Modify: `src/lib/dates.ts` (add `addDaysISO`)
- Test: `tests/review.test.ts`
- Test: `tests/dates.test.ts` (extend existing file)

**Interfaces:**
- Consumes: `Goal` type from `@/lib/targets`.
- Produces:
  - `addDaysISO(dateStr: string, days: number): string` — appended to `@/lib/dates`, returns a `YYYY-MM-DD` string `days` days after (or before, if negative) `dateStr`, computed via local-time `Date` construction from parsed Y/M/D components (not `new Date(dateStr)`, which parses as UTC and can shift by a day).
  - `interface DayAdherence { date: string; caloriesEaten: number; calorieTarget: number; proteinEaten: number; proteinTarget: number }`
  - `interface WeightPoint { date: string; weightKg: number }`
  - `type RecommendationType = 'decrease_calories' | 'increase_calories' | 'improve_protein' | 'on_track' | 'insufficient_data'`
  - `interface Recommendation { type: RecommendationType; message: string; calorieAdjustment: number | null }`
  - `interface WeeklyReviewResult { weightTrendPercent: number | null; calorieAdherencePercent: number; proteinAdherencePercent: number; recommendation: Recommendation }`
  - `computeWeeklyReview(input: { goal: Goal; days: DayAdherence[]; weightPoints: WeightPoint[]; loggedDaysCount: number }): WeeklyReviewResult`

- [ ] **Step 1: Write the failing `addDaysISO` test**

Append to `tests/dates.test.ts`:

```ts
import { addDaysISO } from '@/lib/dates';

describe('addDaysISO', () => {
  it('adds and subtracts days without a UTC-parsing shift', () => {
    expect(addDaysISO('2026-07-03', -6)).toBe('2026-06-27');
    expect(addDaysISO('2026-07-03', 0)).toBe('2026-07-03');
  });

  it('rolls over month and year boundaries correctly', () => {
    expect(addDaysISO('2026-01-03', -5)).toBe('2025-12-29');
  });
});
```

(Add the `import { addDaysISO } from '@/lib/dates';` to the existing `tests/dates.test.ts` import line — don't duplicate the `import { todayLocalISO } from '@/lib/dates';` import, merge into one.)

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test`
Expected: FAIL — `addDaysISO` is not exported from `@/lib/dates`.

- [ ] **Step 3: Implement `addDaysISO`**

Append to `src/lib/dates.ts`:

```ts
export function addDaysISO(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test`
Expected: `addDaysISO` tests pass.

- [ ] **Step 5: Write the failing `computeWeeklyReview` tests**

Create `tests/review.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeWeeklyReview, type DayAdherence, type WeightPoint } from '@/lib/review';

const day = (over: Partial<DayAdherence>): DayAdherence => ({
  date: '2026-07-01', caloriesEaten: 1800, calorieTarget: 1800, proteinEaten: 160, proteinTarget: 160,
  ...over,
});

describe('computeWeeklyReview', () => {
  it('recommends nothing when fewer than 10 logged days exist', () => {
    const result = computeWeeklyReview({ goal: 'fat_loss', days: [day({})], weightPoints: [], loggedDaysCount: 5 });
    expect(result.recommendation).toEqual({
      type: 'insufficient_data',
      message: 'Log a bit more before we can make a recommendation — need at least 10 days of data.',
      calorieAdjustment: null,
    });
  });

  it('prioritizes protein below 80% over any calorie recommendation', () => {
    const result = computeWeeklyReview({
      goal: 'fat_loss',
      days: [day({ proteinEaten: 100, proteinTarget: 160 })], // 62.5%
      weightPoints: [{ date: '2026-06-20', weightKg: 80 }, { date: '2026-07-01', weightKg: 79.9 }],
      loggedDaysCount: 15,
    });
    expect(result.recommendation.type).toBe('improve_protein');
  });

  it('recommends decreasing calories when cutting and weight is flat', () => {
    const weightPoints: WeightPoint[] = [
      { date: '2026-06-17', weightKg: 80 },
      { date: '2026-07-01', weightKg: 79.9 }, // 14 days, -0.125% total -> -0.0625%/week
    ];
    const result = computeWeeklyReview({ goal: 'fat_loss', days: [day({})], weightPoints, loggedDaysCount: 15 });
    expect(result.recommendation).toEqual({
      type: 'decrease_calories',
      message: 'Weight has been flat — try cutting calories a bit.',
      calorieAdjustment: -125,
    });
  });

  it('recommends increasing calories when losing faster than 1%/week', () => {
    const weightPoints: WeightPoint[] = [
      { date: '2026-06-17', weightKg: 80 },
      { date: '2026-07-01', weightKg: 77.6 }, // 14 days, -3% total -> -1.5%/week
    ];
    const result = computeWeeklyReview({ goal: 'fat_loss', days: [day({})], weightPoints, loggedDaysCount: 15 });
    expect(result.recommendation).toEqual({
      type: 'increase_calories',
      message: 'Losing weight faster than recommended — try eating a bit more.',
      calorieAdjustment: 100,
    });
  });

  it('reports on_track for a fat_loss trend between the thresholds', () => {
    const weightPoints: WeightPoint[] = [
      { date: '2026-06-17', weightKg: 80 },
      { date: '2026-07-01', weightKg: 79.2 }, // 14 days, -1% total -> -0.5%/week
    ];
    const result = computeWeeklyReview({ goal: 'fat_loss', days: [day({})], weightPoints, loggedDaysCount: 15 });
    expect(result.recommendation.type).toBe('on_track');
  });

  it('reports on_track for muscle_gain and maintain regardless of weight trend', () => {
    const weightPoints: WeightPoint[] = [
      { date: '2026-06-17', weightKg: 80 },
      { date: '2026-07-01', weightKg: 80 },
    ];
    const gain = computeWeeklyReview({ goal: 'muscle_gain', days: [day({})], weightPoints, loggedDaysCount: 15 });
    const maintain = computeWeeklyReview({ goal: 'maintain', days: [day({})], weightPoints, loggedDaysCount: 15 });
    expect(gain.recommendation.type).toBe('on_track');
    expect(maintain.recommendation.type).toBe('on_track');
  });

  it('returns a null weight trend with fewer than 2 weight points, and falls back to on_track', () => {
    const result = computeWeeklyReview({ goal: 'fat_loss', days: [day({})], weightPoints: [], loggedDaysCount: 15 });
    expect(result.weightTrendPercent).toBeNull();
    expect(result.recommendation.type).toBe('on_track');
  });

  it('averages calorie and protein adherence across days', () => {
    const result = computeWeeklyReview({
      goal: 'maintain',
      days: [
        day({ caloriesEaten: 1800, calorieTarget: 1800, proteinEaten: 160, proteinTarget: 160 }), // 100%/100%
        day({ caloriesEaten: 1600, calorieTarget: 2000, proteinEaten: 140, proteinTarget: 160 }), // 80%/87.5%
      ],
      weightPoints: [],
      loggedDaysCount: 15,
    });
    expect(result.calorieAdherencePercent).toBe(90);
    expect(result.proteinAdherencePercent).toBe(94);
  });
});
```

- [ ] **Step 6: Run to verify they fail**

Run: `npm run test`
Expected: FAIL — cannot resolve `@/lib/review`.

- [ ] **Step 7: Implement**

Create `src/lib/review.ts`:

```ts
import type { Goal } from './targets';

export interface DayAdherence {
  date: string;
  caloriesEaten: number;
  calorieTarget: number;
  proteinEaten: number;
  proteinTarget: number;
}

export interface WeightPoint {
  date: string;
  weightKg: number;
}

export type RecommendationType = 'decrease_calories' | 'increase_calories' | 'improve_protein' | 'on_track' | 'insufficient_data';

export interface Recommendation {
  type: RecommendationType;
  message: string;
  calorieAdjustment: number | null;
}

export interface WeeklyReviewResult {
  weightTrendPercent: number | null;
  calorieAdherencePercent: number;
  proteinAdherencePercent: number;
  recommendation: Recommendation;
}

const MIN_LOGGED_DAYS = 10;
const PROTEIN_ADHERENCE_MIN = 80;
const FLAT_THRESHOLD = -0.25;
const FAST_LOSS_THRESHOLD = -1;
const CUT_DECREASE_KCAL = -125;
const CUT_INCREASE_KCAL = 100;

function daysBetween(a: string, b: string): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / msPerDay);
}

function averagePercent(
  days: DayAdherence[],
  eatenKey: 'caloriesEaten' | 'proteinEaten',
  targetKey: 'calorieTarget' | 'proteinTarget',
): number {
  if (days.length === 0) return 0;
  const total = days.reduce((sum, d) => sum + (d[eatenKey] / d[targetKey]) * 100, 0);
  return Math.round(total / days.length);
}

function computeWeightTrendPercent(weightPoints: WeightPoint[]): number | null {
  if (weightPoints.length < 2) return null;
  const first = weightPoints[0];
  const last = weightPoints[weightPoints.length - 1];
  const spanDays = daysBetween(first.date, last.date);
  if (spanDays <= 0) return null;
  const percentChange = ((last.weightKg - first.weightKg) / first.weightKg) * 100;
  return percentChange / (spanDays / 7);
}

export function computeWeeklyReview(input: {
  goal: Goal;
  days: DayAdherence[];
  weightPoints: WeightPoint[];
  loggedDaysCount: number;
}): WeeklyReviewResult {
  const weightTrendPercent = computeWeightTrendPercent(input.weightPoints);
  const calorieAdherencePercent = averagePercent(input.days, 'caloriesEaten', 'calorieTarget');
  const proteinAdherencePercent = averagePercent(input.days, 'proteinEaten', 'proteinTarget');

  let recommendation: Recommendation;
  if (input.loggedDaysCount < MIN_LOGGED_DAYS) {
    recommendation = {
      type: 'insufficient_data',
      message: `Log a bit more before we can make a recommendation — need at least ${MIN_LOGGED_DAYS} days of data.`,
      calorieAdjustment: null,
    };
  } else if (proteinAdherencePercent < PROTEIN_ADHERENCE_MIN) {
    recommendation = {
      type: 'improve_protein',
      message: 'Protein has been below target most days — focus there before adjusting calories.',
      calorieAdjustment: null,
    };
  } else if (input.goal === 'fat_loss' && weightTrendPercent !== null && weightTrendPercent > FLAT_THRESHOLD) {
    recommendation = {
      type: 'decrease_calories',
      message: 'Weight has been flat — try cutting calories a bit.',
      calorieAdjustment: CUT_DECREASE_KCAL,
    };
  } else if (input.goal === 'fat_loss' && weightTrendPercent !== null && weightTrendPercent < FAST_LOSS_THRESHOLD) {
    recommendation = {
      type: 'increase_calories',
      message: 'Losing weight faster than recommended — try eating a bit more.',
      calorieAdjustment: CUT_INCREASE_KCAL,
    };
  } else {
    recommendation = {
      type: 'on_track',
      message: 'On track — no changes needed this week.',
      calorieAdjustment: null,
    };
  }

  return { weightTrendPercent, calorieAdherencePercent, proteinAdherencePercent, recommendation };
}
```

- [ ] **Step 8: Run to verify they pass**

Run: `npm run test`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: weekly review engine and addDaysISO date helper"
```

---

### Task 3: Queries module additions — date-range queries and weekly reviews

**Files:**
- Modify: `src/db/queries.ts`
- Test: `tests/queries-review.test.ts`

**Interfaces:**
- Consumes: `weeklyReviews` from `@/db/schema` (Task 1); `Recommendation` from `@/lib/review` (Task 2); existing `applyOverrides`, `calcTargets` (already imported from `@/lib/targets` — add `applyOverrides` to that import if not already present), `gte`/`lte` from `drizzle-orm` (new — add to the existing import line).
- Produces (all functions take `db: DB` first):
  - `getDiaryEntriesRange(db, fromDate: string, toDate: string): Promise<DiaryEntry[]>` — inclusive range, ordered by date then `loggedAt`.
  - `getDayLogsRange(db, fromDate: string, toDate: string): Promise<DayLog[]>` — inclusive range, ordered by date. Only returns rows that exist (no synthesized defaults for missing dates — callers handle the "no row = default" case themselves, same as the existing single-date `getDayLog`).
  - `getWorkoutSessionsRange(db, fromDate: string, toDate: string): Promise<WorkoutSession[]>` — inclusive range, ordered by date.
  - `interface WeeklyReview { id: number; weekStart: string; weightTrendPercent: number | null; calorieAdherencePercent: number; proteinAdherencePercent: number; workoutsCompleted: number; workoutsPlanned: number; recommendation: Recommendation; applied: boolean }`
  - `createWeeklyReview(db, input: Omit<WeeklyReview, 'id' | 'applied'>): Promise<WeeklyReview>` — always inserts with `applied: false`.
  - `getLatestWeeklyReview(db): Promise<WeeklyReview | null>`
  - `applyWeeklyReviewRecommendation(db, reviewId: number, effectiveFrom: string): Promise<void>` — throws if the review doesn't exist or if `calorieAdjustment !== null` and no profile exists yet; when `calorieAdjustment !== null`, adds the adjustment to BOTH `caloriesGym` and `caloriesRest` on top of current effective targets and persists via `saveOverrides`; always marks the review `applied: true` at the end regardless of whether an adjustment was made.

- [ ] **Step 1: Write failing tests**

Create `tests/queries-review.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers/db';
import {
  saveProfile, addDiaryEntry, getDiaryEntriesRange, upsertDayLog, getDayLogsRange,
  createWorkoutSession, getWorkoutSessionsRange,
  createWeeklyReview, getLatestWeeklyReview, applyWeeklyReviewRecommendation, getOverrides,
  type DB,
} from '@/db/queries';

const BASE_PROFILE = {
  name: 'Darryl', weightKg: 85, heightCm: 170, age: 31,
  gender: 'male' as const, goal: 'fat_loss' as const,
  gymDaysPerWeek: 4, experience: 'intermediate' as const,
};

let db: DB;
beforeEach(async () => { db = await createTestDb(); });

describe('date-range queries', () => {
  it('returns diary entries within an inclusive date range, ordered by date', async () => {
    await addDiaryEntry(db, { date: '2026-06-28', mealSlot: 'lunch', foodItemId: null, name: 'A', portionMultiplier: 1, calories: 500, protein: 30, carbs: 50, fat: 10 });
    await addDiaryEntry(db, { date: '2026-07-01', mealSlot: 'lunch', foodItemId: null, name: 'B', portionMultiplier: 1, calories: 600, protein: 35, carbs: 60, fat: 15 });
    await addDiaryEntry(db, { date: '2026-07-05', mealSlot: 'lunch', foodItemId: null, name: 'C', portionMultiplier: 1, calories: 700, protein: 40, carbs: 70, fat: 20 });

    const entries = await getDiaryEntriesRange(db, '2026-06-29', '2026-07-01');
    expect(entries.map((e) => e.name)).toEqual(['B']);
  });

  it('returns day logs within an inclusive date range', async () => {
    await upsertDayLog(db, '2026-06-30', { waterL: 1 });
    await upsertDayLog(db, '2026-07-01', { waterL: 2 });
    const logs = await getDayLogsRange(db, '2026-07-01', '2026-07-02');
    expect(logs.map((l) => l.date)).toEqual(['2026-07-01']);
  });

  it('returns workout sessions within an inclusive date range', async () => {
    await createWorkoutSession(db, { date: '2026-06-30', routineDayLabel: 'A' });
    await createWorkoutSession(db, { date: '2026-07-01', routineDayLabel: 'B' });
    await createWorkoutSession(db, { date: '2026-07-03', routineDayLabel: 'A' });
    const sessions = await getWorkoutSessionsRange(db, '2026-07-01', '2026-07-02');
    expect(sessions.map((s) => s.routineDayLabel)).toEqual(['B']);
  });
});

describe('weekly reviews', () => {
  const RECOMMENDATION = { type: 'on_track' as const, message: 'On track', calorieAdjustment: null };

  it('returns null before any review exists', async () => {
    expect(await getLatestWeeklyReview(db)).toBeNull();
  });

  it('creates and retrieves the latest weekly review', async () => {
    await createWeeklyReview(db, {
      weekStart: '2026-06-22', weightTrendPercent: -0.5, calorieAdherencePercent: 90,
      proteinAdherencePercent: 85, workoutsCompleted: 3, workoutsPlanned: 4, recommendation: RECOMMENDATION,
    });
    await createWeeklyReview(db, {
      weekStart: '2026-06-29', weightTrendPercent: -0.3, calorieAdherencePercent: 95,
      proteinAdherencePercent: 90, workoutsCompleted: 4, workoutsPlanned: 4, recommendation: RECOMMENDATION,
    });
    const latest = await getLatestWeeklyReview(db);
    expect(latest?.weekStart).toBe('2026-06-29');
    expect(latest?.applied).toBe(false);
  });

  it('marks a review applied without touching targets when calorieAdjustment is null', async () => {
    await saveProfile(db, BASE_PROFILE);
    const review = await createWeeklyReview(db, {
      weekStart: '2026-06-29', weightTrendPercent: 0, calorieAdherencePercent: 90,
      proteinAdherencePercent: 90, workoutsCompleted: 4, workoutsPlanned: 4, recommendation: RECOMMENDATION,
    });
    await applyWeeklyReviewRecommendation(db, review.id, '2026-07-06');
    expect((await getLatestWeeklyReview(db))?.applied).toBe(true);
    expect(await getOverrides(db)).toEqual({});
  });

  it('applies a calorie adjustment on top of current effective targets', async () => {
    await saveProfile(db, BASE_PROFILE);
    const review = await createWeeklyReview(db, {
      weekStart: '2026-06-29', weightTrendPercent: -0.1, calorieAdherencePercent: 90,
      proteinAdherencePercent: 90, workoutsCompleted: 4, workoutsPlanned: 4,
      recommendation: { type: 'decrease_calories', message: 'Cut a bit', calorieAdjustment: -125 },
    });
    await applyWeeklyReviewRecommendation(db, review.id, '2026-07-06');
    const overrides = await getOverrides(db);
    // fat_loss @ 85kg: caloriesGym 1947, caloriesRest 1649 (see tests/targets.test.ts), minus 125
    expect(overrides.caloriesGym).toBe(1947 - 125);
    expect(overrides.caloriesRest).toBe(1649 - 125);
  });

  it('throws when applying a recommendation before a profile exists', async () => {
    const review = await createWeeklyReview(db, {
      weekStart: '2026-06-29', weightTrendPercent: -0.1, calorieAdherencePercent: 90,
      proteinAdherencePercent: 90, workoutsCompleted: 4, workoutsPlanned: 4,
      recommendation: { type: 'decrease_calories', message: 'Cut a bit', calorieAdjustment: -125 },
    });
    await expect(applyWeeklyReviewRecommendation(db, review.id, '2026-07-06')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test`
Expected: FAIL — the new exports don't exist yet.

- [ ] **Step 3: Implement**

Update the top-of-file drizzle-orm import in `src/db/queries.ts` to add `gte, lte`:

```ts
import { and, desc, eq, gte, ilike, isNotNull, lte, max, sql } from 'drizzle-orm';
```

Update the `@/lib/targets` import to add `applyOverrides` if it isn't already imported (check first — Task 1's `saveOverrides` already uses `calcTargets`; `applyOverrides` may not yet be imported into `queries.ts`):

```ts
import { applyOverrides, calcTargets, type Goal, type Overrides } from '@/lib/targets';
```

Add `import type { Recommendation } from '@/lib/review';` alongside the other type-only imports at the top.

Append to `src/db/queries.ts`:

```ts
export async function getDiaryEntriesRange(db: DB, fromDate: string, toDate: string): Promise<DiaryEntry[]> {
  const rows = await db.select().from(schema.diaryEntries)
    .where(and(gte(schema.diaryEntries.date, fromDate), lte(schema.diaryEntries.date, toDate)))
    .orderBy(schema.diaryEntries.date, schema.diaryEntries.loggedAt);
  return rows.map(toDiaryEntry);
}

export async function getDayLogsRange(db: DB, fromDate: string, toDate: string): Promise<DayLog[]> {
  return db.select().from(schema.dayLog)
    .where(and(gte(schema.dayLog.date, fromDate), lte(schema.dayLog.date, toDate)))
    .orderBy(schema.dayLog.date);
}

export async function getWorkoutSessionsRange(db: DB, fromDate: string, toDate: string): Promise<WorkoutSession[]> {
  return db.select().from(schema.workoutSessions)
    .where(and(gte(schema.workoutSessions.date, fromDate), lte(schema.workoutSessions.date, toDate)))
    .orderBy(schema.workoutSessions.date);
}

export interface WeeklyReview {
  id: number;
  weekStart: string;
  weightTrendPercent: number | null;
  calorieAdherencePercent: number;
  proteinAdherencePercent: number;
  workoutsCompleted: number;
  workoutsPlanned: number;
  recommendation: Recommendation;
  applied: boolean;
}

function toWeeklyReview(row: typeof schema.weeklyReviews.$inferSelect): WeeklyReview {
  const { createdAt: _createdAt, ...rest } = row;
  return { ...rest, recommendation: row.recommendation as Recommendation };
}

export async function createWeeklyReview(
  db: DB,
  input: Omit<WeeklyReview, 'id' | 'applied'>,
): Promise<WeeklyReview> {
  const [row] = await db.insert(schema.weeklyReviews).values({ ...input, applied: false }).returning();
  return toWeeklyReview(row);
}

export async function getLatestWeeklyReview(db: DB): Promise<WeeklyReview | null> {
  const rows = await db.select().from(schema.weeklyReviews).orderBy(desc(schema.weeklyReviews.id)).limit(1);
  return rows.length === 0 ? null : toWeeklyReview(rows[0]);
}

export async function applyWeeklyReviewRecommendation(db: DB, reviewId: number, effectiveFrom: string): Promise<void> {
  const rows = await db.select().from(schema.weeklyReviews).where(eq(schema.weeklyReviews.id, reviewId));
  if (rows.length === 0) throw new Error('Weekly review not found');
  const review = toWeeklyReview(rows[0]);

  if (review.recommendation.calorieAdjustment !== null) {
    const profile = await getProfile(db);
    if (!profile) throw new Error('Cannot apply a recommendation before a profile exists');
    const calculated = calcTargets({ weightKg: profile.weightKg, goal: profile.goal });
    const currentOverrides = await getOverrides(db);
    const effective = applyOverrides(calculated, currentOverrides);
    const delta = review.recommendation.calorieAdjustment;
    await saveOverrides(db, {
      ...currentOverrides,
      caloriesGym: effective.caloriesGym + delta,
      caloriesRest: effective.caloriesRest + delta,
    }, effectiveFrom);
  }

  await db.update(schema.weeklyReviews).set({ applied: true }).where(eq(schema.weeklyReviews.id, reviewId));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: date-range queries and weekly review queries"
```

---

### Task 4: Validation schema for applying a review

**Files:**
- Modify: `src/lib/validate.ts`
- Test: `tests/validate-review.test.ts`

**Interfaces:**
- Consumes: `DateString` (already in `validate.ts`).
- Produces: `GenerateReviewBody` — `{ today: DateString }` — and `ApplyReviewBody` — `{ effectiveFrom: DateString }`. Both are named exports, consistent with every other route body schema already in `validate.ts`.

- [ ] **Step 1: Write failing tests**

Create `tests/validate-review.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ApplyReviewBody, GenerateReviewBody } from '@/lib/validate';

describe('GenerateReviewBody', () => {
  it('accepts a valid date and rejects a malformed one', () => {
    expect(GenerateReviewBody.safeParse({ today: '2026-07-03' }).success).toBe(true);
    expect(GenerateReviewBody.safeParse({ today: '07/03/2026' }).success).toBe(false);
    expect(GenerateReviewBody.safeParse({}).success).toBe(false);
  });
});

describe('ApplyReviewBody', () => {
  it('accepts a valid date and rejects a malformed one', () => {
    expect(ApplyReviewBody.safeParse({ effectiveFrom: '2026-07-03' }).success).toBe(true);
    expect(ApplyReviewBody.safeParse({ effectiveFrom: 'not-a-date' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test`
Expected: FAIL — new exports don't exist yet.

- [ ] **Step 3: Implement**

Append to `src/lib/validate.ts`:

```ts
export const GenerateReviewBody = z.object({
  today: DateString,
});

export const ApplyReviewBody = z.object({
  effectiveFrom: DateString,
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: validation schemas for generating and applying weekly reviews"
```

---

### Task 5: API routes — weekly review generation and apply

**Files:**
- Create: `src/app/api/reviews/route.ts`, `src/app/api/reviews/[id]/apply/route.ts`

**Interfaces:**
- Consumes: `getProfile`, `getOverrides`, `getDiaryEntriesRange`, `getDayLogsRange`, `getWorkoutSessionsRange`, `getWeightLog`, `getActiveRoutine`, `createWeeklyReview`, `getLatestWeeklyReview`, `applyWeeklyReviewRecommendation` from `@/db/queries`; `calcTargets`, `applyOverrides` from `@/lib/targets`; `computeWeeklyReview` from `@/lib/review`; `addDaysISO` from `@/lib/dates`; `sumEntries` from `@/lib/food`; `GenerateReviewBody`, `ApplyReviewBody` from `@/lib/validate`.
- Produces:
  - `GET /api/reviews` → `{ review: WeeklyReview | null }` (latest)
  - `POST /api/reviews` body `{ today: 'YYYY-MM-DD' }` → computes the review for the trailing 7-day window ending on `today` (a 30-day lookback for `loggedDaysCount` and weight trend), persists it, returns `{ review }`. 404 if no profile exists yet.
  - `POST /api/reviews/[id]/apply` body `{ effectiveFrom: 'YYYY-MM-DD' }` → applies the recommendation, returns `{ review: WeeklyReview | null }` (the latest review, re-fetched — per this phase's scope decision, "apply" always targets the most recent review, matching what the Coach page shows).

- [ ] **Step 1: Implement `POST`/`GET /api/reviews`**

Create `src/app/api/reviews/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { db } from '@/db';
import {
  createWeeklyReview, getActiveRoutine, getDayLogsRange, getDiaryEntriesRange,
  getLatestWeeklyReview, getOverrides, getProfile, getWeightLog, getWorkoutSessionsRange,
} from '@/db/queries';
import { addDaysISO } from '@/lib/dates';
import { sumEntries } from '@/lib/food';
import { computeWeeklyReview, type DayAdherence } from '@/lib/review';
import { applyOverrides, calcTargets } from '@/lib/targets';
import { GenerateReviewBody } from '@/lib/validate';

export async function GET() {
  return NextResponse.json({ review: await getLatestWeeklyReview(db) });
}

export async function POST(req: Request) {
  const parsed = GenerateReviewBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
  }
  const { today } = parsed.data;

  const profile = await getProfile(db);
  if (!profile) return NextResponse.json({ error: 'No profile yet' }, { status: 404 });

  const weekStart = addDaysISO(today, -6);
  const lookbackStart = addDaysISO(today, -29);

  const calculated = calcTargets({ weightKg: profile.weightKg, goal: profile.goal });
  const overrides = await getOverrides(db);
  const effective = applyOverrides(calculated, overrides);

  const [weekEntries, weekDayLogs, lookbackEntries, weightLog, sessions, activeRoutine] = await Promise.all([
    getDiaryEntriesRange(db, weekStart, today),
    getDayLogsRange(db, weekStart, today),
    getDiaryEntriesRange(db, lookbackStart, today),
    getWeightLog(db, 60),
    getWorkoutSessionsRange(db, weekStart, today),
    getActiveRoutine(db),
  ]);

  const dayLogByDate = new Map(weekDayLogs.map((d) => [d.date, d]));
  const days: DayAdherence[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDaysISO(weekStart, i);
    const entriesForDate = weekEntries.filter((e) => e.date === date);
    const totals = sumEntries(entriesForDate);
    const isGymDay = dayLogByDate.get(date)?.isGymDay ?? true;
    days.push({
      date,
      caloriesEaten: totals.calories,
      calorieTarget: isGymDay ? effective.caloriesGym : effective.caloriesRest,
      proteinEaten: totals.protein,
      proteinTarget: effective.protein,
    });
  }

  const loggedDaysCount = new Set(lookbackEntries.map((e) => e.date)).size;
  const weightPoints = weightLog
    .filter((w) => w.date >= lookbackStart && w.date <= today)
    .slice()
    .reverse(); // getWeightLog returns descending; computeWeeklyReview expects chronological order

  const result = computeWeeklyReview({
    goal: profile.goal,
    days,
    weightPoints,
    loggedDaysCount,
  });

  const review = await createWeeklyReview(db, {
    weekStart,
    weightTrendPercent: result.weightTrendPercent,
    calorieAdherencePercent: result.calorieAdherencePercent,
    proteinAdherencePercent: result.proteinAdherencePercent,
    workoutsCompleted: sessions.length,
    workoutsPlanned: activeRoutine?.daysPerWeek ?? 0,
    recommendation: result.recommendation,
  });

  return NextResponse.json({ review });
}
```

- [ ] **Step 2: Implement `POST /api/reviews/[id]/apply`**

Create `src/app/api/reviews/[id]/apply/route.ts`:

```ts
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
```

- [ ] **Step 3: Verify build**

Run: `npm run test` → all pass.
Run: `npm run build` → succeeds, lists `/api/reviews` and `/api/reviews/[id]/apply`.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: weekly review generation and apply API routes"
```

---

### Task 6: Coach page UI

**Files:**
- Create: `src/components/coach/WeeklyReviewCard.tsx`
- Modify: `src/app/(app)/coach/page.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `WeeklyReview` type from `@/db/queries`; `todayLocalISO` from `@/lib/dates`.
- Produces: `CoachPage` fetches the latest review on mount; a "Generate this week's review" button POSTs `{ today: todayLocalISO() }` to `/api/reviews`; `WeeklyReviewCard` renders the review's stats and, when `recommendation.calorieAdjustment !== null && !applied`, an "Apply" button that POSTs `{ effectiveFrom: todayLocalISO() }` to `/api/reviews/[id]/apply`.

- [ ] **Step 1: Implement `WeeklyReviewCard`**

Create `src/components/coach/WeeklyReviewCard.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { WeeklyReview } from '@/db/queries';
import { todayLocalISO } from '@/lib/dates';

const RECOMMENDATION_COLOR: Record<string, string> = {
  decrease_calories: 'border-amber-700 bg-amber-900/20 text-amber-300',
  increase_calories: 'border-amber-700 bg-amber-900/20 text-amber-300',
  improve_protein: 'border-amber-700 bg-amber-900/20 text-amber-300',
  on_track: 'border-emerald-700 bg-emerald-900/20 text-emerald-300',
  insufficient_data: 'border-gray-700 bg-gray-800/50 text-gray-400',
};

export default function WeeklyReviewCard({
  review,
  onApplied,
}: {
  review: WeeklyReview;
  onApplied: () => Promise<void>;
}) {
  const [applying, setApplying] = useState(false);
  const [status, setStatus] = useState('');

  async function apply() {
    setApplying(true);
    const res = await fetch(`/api/reviews/${review.id}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ effectiveFrom: todayLocalISO() }),
    });
    if (res.ok) {
      setStatus('Applied — targets updated');
      await onApplied();
    } else {
      setStatus('Failed to apply — try again');
    }
    setApplying(false);
  }

  const canApply = review.recommendation.calorieAdjustment !== null && !review.applied;

  return (
    <div className="rounded-xl bg-gray-900 p-4">
      <div className="mb-1 text-[11px] uppercase tracking-wider text-gray-500">Week of {review.weekStart}</div>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <div className="text-lg font-bold text-gray-50">
            {review.weightTrendPercent === null ? '—' : `${review.weightTrendPercent.toFixed(2)}%/wk`}
          </div>
          <div className="text-[11px] text-gray-500">Weight trend</div>
        </div>
        <div>
          <div className="text-lg font-bold text-gray-50">{review.calorieAdherencePercent}%</div>
          <div className="text-[11px] text-gray-500">Calorie adherence</div>
        </div>
        <div>
          <div className="text-lg font-bold text-gray-50">{review.proteinAdherencePercent}%</div>
          <div className="text-[11px] text-gray-500">Protein adherence</div>
        </div>
        <div>
          <div className="text-lg font-bold text-gray-50">{review.workoutsCompleted} / {review.workoutsPlanned}</div>
          <div className="text-[11px] text-gray-500">Workouts</div>
        </div>
      </div>

      <div className={`rounded-lg border p-3 text-sm ${RECOMMENDATION_COLOR[review.recommendation.type]}`}>
        {review.recommendation.message}
      </div>

      {canApply && (
        <button
          onClick={apply}
          disabled={applying}
          className="mt-3 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {applying ? 'Applying…' : `Apply (${review.recommendation.calorieAdjustment! > 0 ? '+' : ''}${review.recommendation.calorieAdjustment} kcal)`}
        </button>
      )}
      {review.applied && <p className="mt-3 text-xs text-gray-500">Applied.</p>}
      {status && <p className="mt-2 text-xs text-emerald-400">{status}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Replace the Coach page placeholder**

Replace `src/app/(app)/coach/page.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import type { WeeklyReview } from '@/db/queries';
import { todayLocalISO } from '@/lib/dates';
import WeeklyReviewCard from '@/components/coach/WeeklyReviewCard';

export default function CoachPage() {
  const [review, setReview] = useState<WeeklyReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState('');

  const reload = useCallback(async () => {
    const r = await fetch('/api/reviews').then((res) => res.json());
    setReview(r.review);
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void reload(); }, [reload]);

  async function generate() {
    setGenerating(true);
    setStatus('');
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ today: todayLocalISO() }),
    });
    if (res.ok) {
      await reload();
    } else {
      setStatus('Failed to generate review — try again');
    }
    setGenerating(false);
  }

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Loading…</div>;
  }

  return (
    <div className="space-y-5 p-5">
      <h1 className="text-xl font-bold text-gray-50">Coach</h1>
      <button
        onClick={generate}
        disabled={generating}
        className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {generating ? 'Generating…' : "Generate this week's review"}
      </button>
      {status && <p className="text-xs text-red-400">{status}</p>}
      {review && <WeeklyReviewCard review={review} onApplied={reload} />}
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npm run test` → all pass. Run: `npm run build` → succeeds.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: coach page with weekly review generation and apply"
```

---

### Task 7: History API route and page

**Files:**
- Create: `src/app/api/history/route.ts`
- Modify: `src/app/(app)/history/page.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `getProfile`, `getOverrides`, `getDiaryEntriesRange`, `getDayLogsRange`, `getWorkoutSessionsRange`, `getWeightLog` from `@/db/queries`; `calcTargets`, `applyOverrides` from `@/lib/targets`; `sumEntries` from `@/lib/food`; `addDaysISO`, `todayLocalISO` from `@/lib/dates`.
- Produces:
  - `GET /api/history?today=YYYY-MM-DD&days=N` (N defaults to 14 if omitted/invalid) → `{ days: HistoryDay[] }`, reverse-chronological (most recent first), where `HistoryDay = { date: string; totals: Macros; calorieTarget: number; isGymDay: boolean; waterL: number; workoutLabel: string | null; weightKg: number | null; entries: DiaryEntry[] }`. 404 if no profile exists yet.
  - History page renders each day as a collapsed summary row with an adherence badge (calorie % vs target: `>105%` red, `88-105%` green, `<88%` blue — same convention as the original prototype); tapping a row expands to show that day's full diary entries.

- [ ] **Step 1: Implement `GET /api/history`**

Create `src/app/api/history/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { db } from '@/db';
import {
  getDayLogsRange, getDiaryEntriesRange, getOverrides, getProfile, getWeightLog, getWorkoutSessionsRange,
} from '@/db/queries';
import { addDaysISO } from '@/lib/dates';
import { sumEntries } from '@/lib/food';
import { applyOverrides, calcTargets } from '@/lib/targets';
import { DateString } from '@/lib/validate';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const today = searchParams.get('today') ?? '';
  if (!DateString.safeParse(today).success) {
    return NextResponse.json({ error: 'Missing or invalid today' }, { status: 400 });
  }
  const daysParam = Number(searchParams.get('days'));
  const days = Number.isInteger(daysParam) && daysParam > 0 && daysParam <= 60 ? daysParam : 14;

  const profile = await getProfile(db);
  if (!profile) return NextResponse.json({ error: 'No profile yet' }, { status: 404 });

  const fromDate = addDaysISO(today, -(days - 1));
  const calculated = calcTargets({ weightKg: profile.weightKg, goal: profile.goal });
  const overrides = await getOverrides(db);
  const effective = applyOverrides(calculated, overrides);

  const [entries, dayLogs, sessions, weightLog] = await Promise.all([
    getDiaryEntriesRange(db, fromDate, today),
    getDayLogsRange(db, fromDate, today),
    getWorkoutSessionsRange(db, fromDate, today),
    getWeightLog(db, 60),
  ]);

  const dayLogByDate = new Map(dayLogs.map((d) => [d.date, d]));
  const sessionByDate = new Map(sessions.map((s) => [s.date, s]));
  const weightByDate = new Map(weightLog.map((w) => [w.date, w.weightKg]));

  const result = [];
  for (let i = 0; i < days; i++) {
    const date = addDaysISO(today, -i);
    const entriesForDate = entries.filter((e) => e.date === date);
    const totals = sumEntries(entriesForDate);
    const isGymDay = dayLogByDate.get(date)?.isGymDay ?? true;
    result.push({
      date,
      totals,
      calorieTarget: isGymDay ? effective.caloriesGym : effective.caloriesRest,
      isGymDay,
      waterL: dayLogByDate.get(date)?.waterL ?? 0,
      workoutLabel: sessionByDate.get(date)?.routineDayLabel ?? null,
      weightKg: weightByDate.get(date) ?? null,
      entries: entriesForDate,
    });
  }

  return NextResponse.json({ days: result });
}
```

This matches the existing `GET /api/diary`/`GET /api/day` pattern of validating a date query param via `DateString.safeParse(...)` from `@/lib/validate`, for consistency with those routes.

- [ ] **Step 2: Replace the History page placeholder**

Replace `src/app/(app)/history/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { DiaryEntry, Macros } from '@/lib/food';
import { todayLocalISO } from '@/lib/dates';

interface HistoryDay {
  date: string;
  totals: Macros;
  calorieTarget: number;
  isGymDay: boolean;
  waterL: number;
  workoutLabel: string | null;
  weightKg: number | null;
  entries: DiaryEntry[];
}

function badgeClass(pct: number): string {
  if (pct > 105) return 'bg-red-900/60 text-red-300';
  if (pct >= 88) return 'bg-emerald-900/60 text-emerald-300';
  return 'bg-blue-900/60 text-blue-300';
}

export default function HistoryPage() {
  const [days, setDays] = useState<HistoryDay[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/history?today=${todayLocalISO()}&days=14`);
      if (res.ok) {
        const data = await res.json();
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDays(data.days);
      } else {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDays([]);
      }
    })();
  }, []);

  if (days === null) {
    return <div className="p-6 text-sm text-gray-500">Loading…</div>;
  }

  return (
    <div className="space-y-3 p-5">
      <h1 className="text-xl font-bold text-gray-50">History</h1>
      {days.map((day) => {
        const pct = day.calorieTarget > 0 ? Math.round((day.totals.calories / day.calorieTarget) * 100) : 0;
        const isOpen = expanded === day.date;
        return (
          <div key={day.date} className="rounded-xl bg-gray-900 p-4">
            <button
              onClick={() => setExpanded(isOpen ? null : day.date)}
              className="flex w-full items-center justify-between text-left"
            >
              <div>
                <div className="text-sm font-semibold text-gray-200">{day.date === todayLocalISO() ? 'Today' : day.date}</div>
                <div className="mt-0.5 text-xs text-gray-500">
                  {Math.round(day.totals.calories)} kcal · {day.workoutLabel ? `Workout: ${day.workoutLabel}` : day.isGymDay ? 'Gym day' : 'Rest day'}
                  {day.weightKg !== null && ` · ${day.weightKg}kg`}
                </div>
              </div>
              <span className={`rounded px-2 py-0.5 text-xs font-semibold ${badgeClass(pct)}`}>{pct}%</span>
            </button>
            {isOpen && (
              <div className="mt-3 space-y-1.5 border-t border-gray-800 pt-3">
                {day.entries.length === 0 && <p className="text-xs text-gray-500">No food logged.</p>}
                {day.entries.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between text-xs text-gray-400">
                    <span>{entry.name}</span>
                    <span>{Math.round(entry.calories)} kcal</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npm run test` → all pass. Run: `npm run build` → succeeds.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: history API route and page with adherence badges and expandable entries"
```

---

### Task 8: PWA manifest and icons

**Files:**
- Create: `src/app/manifest.ts`, `src/app/icon.tsx`, `src/app/apple-icon.tsx`

**Interfaces:**
- Produces: Next.js App Router's built-in file conventions — `manifest.ts` is auto-served at `/manifest.webmanifest` and auto-linked in `<head>`; `icon.tsx`/`apple-icon.tsx` auto-generate PNG icons via `next/og`'s `ImageResponse` and are auto-linked as favicon/`apple-touch-icon` — no manual `<link>` tags needed in `src/app/layout.tsx`.

- [ ] **Step 1: Create the icon files**

Create `src/app/icon.tsx`:

```tsx
import { ImageResponse } from 'next/og';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0f1a',
          borderRadius: 96,
        }}
      >
        <div style={{ fontSize: 220, color: '#60a5fa', fontWeight: 800 }}>FL</div>
      </div>
    ),
    { ...size },
  );
}
```

Create `src/app/apple-icon.tsx`:

```tsx
import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0f1a',
        }}
      >
        <div style={{ fontSize: 76, color: '#60a5fa', fontWeight: 800 }}>FL</div>
      </div>
    ),
    { ...size },
  );
}
```

- [ ] **Step 2: Create the manifest**

Create `src/app/manifest.ts`:

```ts
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Fuel Log',
    short_name: 'Fuel Log',
    description: 'Calorie tracking with a built-in training coach',
    start_url: '/today',
    display: 'standalone',
    background_color: '#0a0f1a',
    theme_color: '#0a0f1a',
    icons: [
      { src: '/icon', sizes: '512x512', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
```

- [ ] **Step 3: Verify the generated routes actually serve correctly**

Run: `npm run build` → should succeed and list `/manifest.webmanifest`, `/icon`, `/apple-icon` (or their equivalent generated route names — Next.js's exact output naming can vary slightly by version) among the routes.

Start the dev server and check with curl or the browser network tab:
- `curl -I http://localhost:3000/manifest.webmanifest` → `200`, `content-type: application/manifest+json`.
- `curl -I http://localhost:3000/icon` → `200`, `content-type: image/png`.
- `curl -I http://localhost:3000/apple-icon` → `200`, `content-type: image/png`.

If any of these paths 404, inspect the actual build output route list (`npm run build`'s printed route table) for the real generated path and update the `src` values in `manifest.ts` to match — this is the one place in this task where you should adapt to whatever Next.js 15.5.20 actually serves rather than assuming the paths above are exactly right.

- [ ] **Step 4: Run full suite**

Run: `npm run test` → all pass (unaffected by this task). Run: `npm run build` → succeeds.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: PWA manifest and auto-generated app icons"
```

---

### Task 9: End-to-end verification and deploy

**Files:** none created — verification task.

**Interfaces:**
- Consumes: everything above, plus the existing `DATABASE_URL` in `.env.local` (Neon).

- [ ] **Step 1: Migrate**

```bash
cd "/Users/darryltan/Calorie App"
set -a && source .env.local && set +a
npm run db:migrate
```

Expected: applies the new migration for `weekly_reviews`.

- [ ] **Step 2: Walk the flows via curl**

Start `npm run dev`, log in, then (persist cookies with `-c /tmp/cj -b /tmp/cj`):

1. `GET /api/reviews` → `{"review":null}` if none generated yet.
2. `POST /api/reviews` `{"today":"<today>"}` → `{"review":{...}}`. If fewer than 10 total logged days exist across your test data, `recommendation.type` will be `"insufficient_data"` — that's expected and correct, not a bug; log some food/weight/workout data across several distinct dates first if you want to exercise the other recommendation branches.
3. `POST /api/reviews/<id>/apply` `{"effectiveFrom":"<today>"}` where `<id>` is the review's id → `{"review":{...,"applied":true}}`. If `recommendation.calorieAdjustment` was non-null, confirm via `GET /api/targets` that the override reflects the adjustment on top of the previously-effective values.
4. `GET /api/history?today=<today>&days=14` → `{"days":[...]}`, 14 entries in reverse-chronological order, each with `totals`, `calorieTarget`, `entries`.

- [ ] **Step 3: Browser walkthrough**

Confirm: Coach tab generates a review and displays weight trend/adherence/workout stats correctly; the Apply button only appears when there's an actual calorie adjustment and the review hasn't been applied yet; applying it updates the Profile tab's targets table (pinned override, matching Phase 1's target-override UI). History tab shows a reverse-chronological list with correctly colored adherence badges (test at least one day over 105%, one in the 88-105% range, and one under 88% if your test data allows); tapping a day expands its entries; tapping again collapses it. On an iPhone (or via responsive/device-mode in the browser), confirm "Add to Home Screen" shows the Fuel Log icon rather than a generic globe/screenshot icon.

- [ ] **Step 4: Fix anything found, run full suite, commit if changed**

```bash
npm run test && npm run build
```

Only commit if fixes were made:

```bash
git add -A && git commit -m "test: verified end-to-end coach review and history flows against real Postgres"
```

- [ ] **Step 5: Deploy**

```bash
git push origin main
npx vercel --prod --yes
```

Re-run the curl checks from Step 2 against the production URL. Watch for the same class of "build succeeded but routes 404" failure mode seen in Phase 1 — if it recurs, check `npx vercel project inspect calorie-tracker` for `Framework Preset`.

---

## Done means

- `npm run test` green; `npm run build` green.
- Coach tab live in production: generate a weekly review, see weight trend/adherence/workout stats, apply a calorie recommendation when one exists.
- History tab live in production: reverse-chronological day list with adherence badges, tap-to-expand entries.
- The app is installable to an iPhone home screen with a branded icon (not the default Next.js icon).
- This completes the originally-scoped Fuel Log app (Phases 1-4). The AI layer (section 7 of the design spec) remains a deliberately separate, user-triggered future phase.
