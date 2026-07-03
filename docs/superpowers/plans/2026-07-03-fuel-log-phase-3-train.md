# Fuel Log Phase 3: Train Tab (Routine Generation + Workout Logging) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working Train tab: generate a workout routine from goal/days-per-week/experience, see the full weekly plan, log today's rotation day as a checklist with sets/reps/weight pre-filled from your last performance, and have logging automatically advance the routine and mark the day as a gym day.

**Architecture:** Same as Phases 1-2 — pure functions in `src/lib` for routine generation and progression math, thin `src/db/queries.ts` additions, Next.js API routes, React client components composed on the Train page. No AI in this phase.

**Tech Stack:** Same as prior phases (Next.js, TypeScript, Tailwind, Drizzle ORM, Neon Postgres, zod, Vitest, PGlite for tests). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-02-fuel-log-app-design.md`, section 4.2 (Train) and section 5 (routines, workout_sessions, set_logs tables) and section 6 (routine generation, progression rule). This is Phase 3 of 4 (Phases 1-2 complete and deployed; Phase 4: Coach reviews + History + PWA polish).

**Scope decisions (confirmed with user before writing this plan):**
1. Exercise selection is fixed per day-type (same core compound lifts for everyone) rather than varying by goal — goal instead changes rep ranges (fat_loss: 10-15, muscle_gain: 6-10, maintain: 8-12), and experience changes sets per exercise (beginner: 3, intermediate: 4, advanced: 5). This keeps routine generation deterministic and fully testable without a goal-tagged exercise database.
2. Progression is tracked per exact exercise name across the whole `set_logs` history, independent of which routine or session it came from. Rebuilding your routine does not reset progression for an exercise that appears in both the old and new plan.

## Global Constraints

- TypeScript strict mode; no `any` in committed code.
- Single-user app: no `user_id` columns anywhere.
- All dates are client-supplied `YYYY-MM-DD` strings via `todayLocalISO()` (already exists at `src/lib/dates.ts`) — never compute "today" server-side.
- Dark theme only. Follow the exact Tailwind class patterns already used in `src/components/today/*.tsx` and `src/components/profile/*.tsx`.
- Run `npm run test` before every commit; run `npm run build` before any task that touches routes/pages.
- Working directory for all commands: `/Users/darryltan/Calorie App`.
- Every DB-touching query function takes `db: DB` (from `@/db/queries`) as its first argument, matching the existing pattern.
- "Today's planned day" is whichever day is at `routine.currentDayIndex` in the active routine's rotation — it is NOT mapped to calendar weekdays. Logging a workout advances `currentDayIndex` to the next day in the rotation (wrapping around).

---

### Task 1: Schema — routines, workout_sessions, set_logs

**Files:**
- Modify: `src/db/schema.ts`
- Create migration via `npm run db:generate` (generated `drizzle/000X_*.sql`)

**Interfaces:**
- Consumes: existing `pgTable`/column helpers already imported in `schema.ts` (including `boolean`, added in Phase 2).
- Produces (new Drizzle tables, importable from `@/db/schema`):
  - `routines`: `id` (serial pk), `goal` (text enum `['fat_loss','maintain','muscle_gain']`, not null), `daysPerWeek` (integer, not null), `experience` (text enum `['beginner','intermediate','advanced']`, not null), `days` (jsonb, not null — array of `{ label, exercises: [{ name, sets, repMin, repMax }] }`), `currentDayIndex` (integer, not null, default 0), `isActive` (boolean, not null, default true), `createdAt` (timestamp, not null, default now).
  - `workoutSessions`: `id` (serial pk), `date` (date, not null), `routineDayLabel` (text, not null — a snapshot of which day was performed, independent of the routine row), `notes` (text, nullable), `createdAt` (timestamp, not null, default now).
  - `setLogs`: `id` (serial pk), `sessionId` (integer, not null, references `workoutSessions.id`), `exerciseName` (text, not null), `setNumber` (integer, not null), `reps` (integer, not null), `weightKg` (real, not null).

- [ ] **Step 1: Append the three tables to schema.ts**

Read the current `src/db/schema.ts` first. Append (no new imports needed — `pgTable`, `serial`, `text`, `real`, `integer`, `date`, `timestamp`, `jsonb`, `boolean` are all already imported):

```ts
export const routines = pgTable('routines', {
  id: serial('id').primaryKey(),
  goal: text('goal', { enum: ['fat_loss', 'maintain', 'muscle_gain'] }).notNull(),
  daysPerWeek: integer('days_per_week').notNull(),
  experience: text('experience', { enum: ['beginner', 'intermediate', 'advanced'] }).notNull(),
  days: jsonb('days').notNull(),
  currentDayIndex: integer('current_day_index').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const workoutSessions = pgTable('workout_sessions', {
  id: serial('id').primaryKey(),
  date: date('date').notNull(),
  routineDayLabel: text('routine_day_label').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const setLogs = pgTable('set_logs', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id').notNull().references(() => workoutSessions.id),
  exerciseName: text('exercise_name').notNull(),
  setNumber: integer('set_number').notNull(),
  reps: integer('reps').notNull(),
  weightKg: real('weight_kg').notNull(),
});
```

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: creates a new `drizzle/000X_*.sql` with three `CREATE TABLE` statements (`routines`, `workout_sessions`, `set_logs`) and a foreign key from `set_logs.session_id` to `workout_sessions.id`.

- [ ] **Step 3: Verify the migration file**

Read the generated SQL and confirm: `routines.days` is `jsonb NOT NULL`, `workout_sessions.notes` is nullable, `set_logs.session_id` has the foreign key reference.

- [ ] **Step 4: Run existing tests to confirm nothing broke**

Run: `npm run test`
Expected: all existing tests still pass (purely additive schema change).

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat: add routines, workout_sessions, and set_logs schema"
```

---

### Task 2: Routine generation and progression pure functions (TDD)

**Files:**
- Create: `src/lib/routine.ts`
- Test: `tests/routine.test.ts`

**Interfaces:**
- Consumes: `Goal` type from `@/lib/targets`.
- Produces:
  - `type Experience = 'beginner' | 'intermediate' | 'advanced'`
  - `interface RoutineExercise { name: string; sets: number; repMin: number; repMax: number }`
  - `interface RoutineDay { label: string; exercises: RoutineExercise[] }`
  - `interface PerformedSet { reps: number; weightKg: number }`
  - `generateRoutine(input: { goal: Goal; daysPerWeek: number; experience: Experience }): RoutineDay[]`
  - `suggestNextPerformance(lastSets: PerformedSet[] | null, repMin: number, repMax: number): { weightKg: number; reps: number } | null`

- [ ] **Step 1: Write failing tests**

Create `tests/routine.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateRoutine, suggestNextPerformance } from '@/lib/routine';

describe('generateRoutine', () => {
  it('cycles Full Body A/B for 2-3 days/week', () => {
    const two = generateRoutine({ goal: 'fat_loss', daysPerWeek: 2, experience: 'beginner' });
    expect(two.map((d) => d.label)).toEqual(['Full Body A', 'Full Body B']);

    const three = generateRoutine({ goal: 'fat_loss', daysPerWeek: 3, experience: 'beginner' });
    expect(three.map((d) => d.label)).toEqual(['Full Body A', 'Full Body B', 'Full Body A']);
  });

  it('uses fixed Upper/Lower A/B for 4 days/week', () => {
    const four = generateRoutine({ goal: 'maintain', daysPerWeek: 4, experience: 'intermediate' });
    expect(four.map((d) => d.label)).toEqual(['Upper A', 'Lower A', 'Upper B', 'Lower B']);
  });

  it('cycles Push/Pull/Legs for 5-7 days/week', () => {
    const five = generateRoutine({ goal: 'muscle_gain', daysPerWeek: 5, experience: 'advanced' });
    expect(five.map((d) => d.label)).toEqual(['Push', 'Pull', 'Legs', 'Push', 'Pull']);

    const seven = generateRoutine({ goal: 'muscle_gain', daysPerWeek: 7, experience: 'advanced' });
    expect(seven.map((d) => d.label)).toEqual(['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs', 'Push']);
  });

  it('sets rep ranges by goal and sets-per-exercise by experience', () => {
    const days = generateRoutine({ goal: 'muscle_gain', daysPerWeek: 4, experience: 'advanced' });
    for (const day of days) {
      for (const ex of day.exercises) {
        expect(ex.repMin).toBe(6);
        expect(ex.repMax).toBe(10);
        expect(ex.sets).toBe(5);
      }
    }
  });

  it('produces the expected exercise list for Full Body A', () => {
    const [dayA] = generateRoutine({ goal: 'fat_loss', daysPerWeek: 1, experience: 'beginner' });
    expect(dayA.label).toBe('Full Body A');
    expect(dayA.exercises.map((e) => e.name)).toEqual([
      'Barbell Squat', 'Bench Press', 'Bent-Over Row', 'Overhead Press', 'Plank',
    ]);
    expect(dayA.exercises.every((e) => e.sets === 3 && e.repMin === 10 && e.repMax === 15)).toBe(true);
  });
});

describe('suggestNextPerformance', () => {
  it('returns null when there is no prior performance', () => {
    expect(suggestNextPerformance(null, 8, 12)).toBeNull();
    expect(suggestNextPerformance([], 8, 12)).toBeNull();
  });

  it('suggests +2.5kg and the bottom of the rep range when all sets hit the top last time', () => {
    const lastSets = [{ reps: 12, weightKg: 50 }, { reps: 12, weightKg: 50 }, { reps: 12, weightKg: 50 }];
    expect(suggestNextPerformance(lastSets, 8, 12)).toEqual({ weightKg: 52.5, reps: 8 });
  });

  it('suggests the same weight and the top of the rep range when not all sets hit the top', () => {
    const lastSets = [{ reps: 10, weightKg: 50 }, { reps: 9, weightKg: 50 }, { reps: 8, weightKg: 50 }];
    expect(suggestNextPerformance(lastSets, 8, 12)).toEqual({ weightKg: 50, reps: 12 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test`
Expected: FAIL — cannot resolve `@/lib/routine`.

- [ ] **Step 3: Implement**

Create `src/lib/routine.ts`:

```ts
import type { Goal } from './targets';

export type Experience = 'beginner' | 'intermediate' | 'advanced';

export interface RoutineExercise {
  name: string;
  sets: number;
  repMin: number;
  repMax: number;
}

export interface RoutineDay {
  label: string;
  exercises: RoutineExercise[];
}

export interface PerformedSet {
  reps: number;
  weightKg: number;
}

const REP_RANGES: Record<Goal, { repMin: number; repMax: number }> = {
  fat_loss: { repMin: 10, repMax: 15 },
  maintain: { repMin: 8, repMax: 12 },
  muscle_gain: { repMin: 6, repMax: 10 },
};

const SETS_BY_EXPERIENCE: Record<Experience, number> = {
  beginner: 3,
  intermediate: 4,
  advanced: 5,
};

const DAY_EXERCISE_NAMES: Record<string, string[]> = {
  'Full Body A': ['Barbell Squat', 'Bench Press', 'Bent-Over Row', 'Overhead Press', 'Plank'],
  'Full Body B': ['Deadlift', 'Incline Dumbbell Press', 'Lat Pulldown', 'Dumbbell Shoulder Press', 'Hanging Leg Raise'],
  'Upper A': ['Bench Press', 'Bent-Over Row', 'Overhead Press', 'Bicep Curl', 'Tricep Pushdown'],
  'Lower A': ['Barbell Squat', 'Romanian Deadlift', 'Leg Press', 'Calf Raise', 'Plank'],
  'Upper B': ['Incline Dumbbell Press', 'Lat Pulldown', 'Dumbbell Shoulder Press', 'Hammer Curl', 'Skull Crusher'],
  'Lower B': ['Deadlift', 'Front Squat', 'Leg Curl', 'Standing Calf Raise', 'Hanging Leg Raise'],
  Push: ['Bench Press', 'Overhead Press', 'Incline Dumbbell Press', 'Tricep Pushdown', 'Lateral Raise'],
  Pull: ['Bent-Over Row', 'Lat Pulldown', 'Face Pull', 'Bicep Curl', 'Hammer Curl'],
  Legs: ['Barbell Squat', 'Romanian Deadlift', 'Leg Press', 'Leg Curl', 'Calf Raise'],
};

function dayLabelsFor(daysPerWeek: number): string[] {
  if (daysPerWeek <= 3) {
    const cycle = ['Full Body A', 'Full Body B'];
    return Array.from({ length: daysPerWeek }, (_, i) => cycle[i % cycle.length]);
  }
  if (daysPerWeek === 4) {
    return ['Upper A', 'Lower A', 'Upper B', 'Lower B'];
  }
  const cycle = ['Push', 'Pull', 'Legs'];
  return Array.from({ length: daysPerWeek }, (_, i) => cycle[i % cycle.length]);
}

export function generateRoutine(input: { goal: Goal; daysPerWeek: number; experience: Experience }): RoutineDay[] {
  const { goal, daysPerWeek, experience } = input;
  const { repMin, repMax } = REP_RANGES[goal];
  const sets = SETS_BY_EXPERIENCE[experience];
  const labels = dayLabelsFor(daysPerWeek);

  return labels.map((label) => ({
    label,
    exercises: DAY_EXERCISE_NAMES[label].map((name) => ({ name, sets, repMin, repMax })),
  }));
}

export function suggestNextPerformance(
  lastSets: PerformedSet[] | null,
  repMin: number,
  repMax: number,
): { weightKg: number; reps: number } | null {
  if (!lastSets || lastSets.length === 0) return null;
  const allHitTop = lastSets.every((s) => s.reps >= repMax);
  const lastWeight = lastSets[lastSets.length - 1].weightKg;
  if (allHitTop) {
    return { weightKg: lastWeight + 2.5, reps: repMin };
  }
  return { weightKg: lastWeight, reps: repMax };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: routine generation and progression pure functions"
```

---

### Task 3: Queries module additions — routines, workout sessions, set logs

**Files:**
- Modify: `src/db/queries.ts`
- Test: `tests/queries-routine.test.ts`

**Interfaces:**
- Consumes: `routines`, `workoutSessions`, `setLogs` from `@/db/schema` (Task 1); `RoutineDay`, `PerformedSet` from `@/lib/routine` (Task 2); `Goal` from `@/lib/targets`; existing `DB` type, `and`/`desc`/`eq` already imported in `queries.ts`.
- Produces (all functions take `db: DB` first):
  - `interface Routine { id: number; goal: Goal; daysPerWeek: number; experience: 'beginner' | 'intermediate' | 'advanced'; days: RoutineDay[]; currentDayIndex: number; isActive: boolean }`
  - `getActiveRoutine(db): Promise<Routine | null>`
  - `createRoutine(db, input: { goal: Goal; daysPerWeek: number; experience: 'beginner'|'intermediate'|'advanced'; days: RoutineDay[] }): Promise<Routine>` — archives (sets `isActive: false` on) any currently-active routine first, then inserts the new one as active with `currentDayIndex: 0`.
  - `advanceRoutineDay(db, routineId: number): Promise<void>` — increments `currentDayIndex` modulo `days.length`, wrapping to 0.
  - `interface WorkoutSession { id: number; date: string; routineDayLabel: string; notes: string | null }`
  - `createWorkoutSession(db, input: { date: string; routineDayLabel: string; notes?: string }): Promise<WorkoutSession>`
  - `addSetLogs(db, sessionId: number, sets: { exerciseName: string; setNumber: number; reps: number; weightKg: number }[]): Promise<void>`
  - `getLastSetsForExercise(db, exerciseName: string): Promise<PerformedSet[] | null>` — finds the single most recent workout session (by date, then by session id as tiebreaker) containing any set for that exact exercise name, and returns all of that session's sets for that exercise ordered by `setNumber`. Returns `null` if the exercise has never been logged.

- [ ] **Step 1: Write failing tests**

Create `tests/queries-routine.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers/db';
import {
  createRoutine, getActiveRoutine, advanceRoutineDay,
  createWorkoutSession, addSetLogs, getLastSetsForExercise, type DB,
} from '@/db/queries';
import type { RoutineDay } from '@/lib/routine';

const SAMPLE_DAYS: RoutineDay[] = [
  { label: 'Full Body A', exercises: [{ name: 'Barbell Squat', sets: 3, repMin: 8, repMax: 12 }] },
  { label: 'Full Body B', exercises: [{ name: 'Deadlift', sets: 3, repMin: 8, repMax: 12 }] },
];

let db: DB;
beforeEach(async () => { db = await createTestDb(); });

describe('routines', () => {
  it('returns null before any routine exists', async () => {
    expect(await getActiveRoutine(db)).toBeNull();
  });

  it('creates an active routine with currentDayIndex 0', async () => {
    const routine = await createRoutine(db, { goal: 'fat_loss', daysPerWeek: 2, experience: 'beginner', days: SAMPLE_DAYS });
    expect(routine.isActive).toBe(true);
    expect(routine.currentDayIndex).toBe(0);
    expect(routine.days).toEqual(SAMPLE_DAYS);
  });

  it('archives the previous active routine when a new one is created', async () => {
    const first = await createRoutine(db, { goal: 'fat_loss', daysPerWeek: 2, experience: 'beginner', days: SAMPLE_DAYS });
    const second = await createRoutine(db, { goal: 'muscle_gain', daysPerWeek: 4, experience: 'advanced', days: SAMPLE_DAYS });
    const active = await getActiveRoutine(db);
    expect(active?.id).toBe(second.id);
    expect(active?.goal).toBe('muscle_gain');
    expect(first.id).not.toBe(second.id);
  });

  it('advances the current day index and wraps around', async () => {
    const routine = await createRoutine(db, { goal: 'fat_loss', daysPerWeek: 2, experience: 'beginner', days: SAMPLE_DAYS });
    await advanceRoutineDay(db, routine.id);
    expect((await getActiveRoutine(db))?.currentDayIndex).toBe(1);
    await advanceRoutineDay(db, routine.id);
    expect((await getActiveRoutine(db))?.currentDayIndex).toBe(0);
  });
});

describe('workout sessions and set logs', () => {
  it('returns null for an exercise never logged', async () => {
    expect(await getLastSetsForExercise(db, 'Bench Press')).toBeNull();
  });

  it("returns the most recent session's sets for an exercise, ordered by set number", async () => {
    const session1 = await createWorkoutSession(db, { date: '2026-07-01', routineDayLabel: 'Full Body A' });
    await addSetLogs(db, session1.id, [
      { exerciseName: 'Barbell Squat', setNumber: 1, reps: 10, weightKg: 60 },
      { exerciseName: 'Barbell Squat', setNumber: 2, reps: 9, weightKg: 60 },
    ]);
    const session2 = await createWorkoutSession(db, { date: '2026-07-03', routineDayLabel: 'Full Body A' });
    await addSetLogs(db, session2.id, [
      { exerciseName: 'Barbell Squat', setNumber: 1, reps: 12, weightKg: 62.5 },
      { exerciseName: 'Barbell Squat', setNumber: 2, reps: 12, weightKg: 62.5 },
    ]);

    const lastSets = await getLastSetsForExercise(db, 'Barbell Squat');
    expect(lastSets).toEqual([
      { reps: 12, weightKg: 62.5 },
      { reps: 12, weightKg: 62.5 },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test`
Expected: FAIL — the new exports don't exist in `@/db/queries` yet.

- [ ] **Step 3: Implement**

Append to `src/db/queries.ts` (add `import type { Goal } from '@/lib/targets';` and `import type { RoutineDay, PerformedSet } from '@/lib/routine';` to the top, alongside the existing imports):

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: routine, workout session, and set log queries"
```

---

### Task 4: Validation schemas for routine and workout routes

**Files:**
- Modify: `src/lib/validate.ts`
- Test: `tests/validate-routine.test.ts`

**Interfaces:**
- Consumes: `DateString` (already in `validate.ts`).
- Produces (appended to `src/lib/validate.ts`):
  - `GenerateRoutineBody` — `{ goal: enum, daysPerWeek: int 1-7, experience: enum }`
  - `LogWorkoutBody` — `{ date: DateString, routineDayLabel: string 1-50 chars, notes: string max 500 chars optional, sets: array (min 1) of { exerciseName: string 1-100 chars, setNumber: int 1-20, reps: int 0-100, weightKg: number 0-500 } }`

- [ ] **Step 1: Write failing tests**

Create `tests/validate-routine.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { GenerateRoutineBody, LogWorkoutBody } from '@/lib/validate';

describe('GenerateRoutineBody', () => {
  const valid = { goal: 'fat_loss', daysPerWeek: 4, experience: 'intermediate' };
  it('accepts a valid body', () => expect(GenerateRoutineBody.safeParse(valid).success).toBe(true));
  it('rejects an out-of-range daysPerWeek and invalid enum', () => {
    expect(GenerateRoutineBody.safeParse({ ...valid, daysPerWeek: 0 }).success).toBe(false);
    expect(GenerateRoutineBody.safeParse({ ...valid, daysPerWeek: 8 }).success).toBe(false);
    expect(GenerateRoutineBody.safeParse({ ...valid, goal: 'get_shredded' }).success).toBe(false);
  });
});

describe('LogWorkoutBody', () => {
  const valid = {
    date: '2026-07-02',
    routineDayLabel: 'Full Body A',
    sets: [{ exerciseName: 'Barbell Squat', setNumber: 1, reps: 10, weightKg: 60 }],
  };
  it('accepts a valid body with and without notes', () => {
    expect(LogWorkoutBody.safeParse(valid).success).toBe(true);
    expect(LogWorkoutBody.safeParse({ ...valid, notes: 'felt strong' }).success).toBe(true);
  });
  it('rejects an empty sets array and out-of-range values', () => {
    expect(LogWorkoutBody.safeParse({ ...valid, sets: [] }).success).toBe(false);
    expect(LogWorkoutBody.safeParse({ ...valid, sets: [{ ...valid.sets[0], weightKg: -5 }] }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test`
Expected: FAIL — new exports don't exist yet.

- [ ] **Step 3: Implement**

Append to `src/lib/validate.ts`:

```ts
export const GenerateRoutineBody = z.object({
  goal: z.enum(['fat_loss', 'maintain', 'muscle_gain']),
  daysPerWeek: z.number().int().min(1).max(7),
  experience: z.enum(['beginner', 'intermediate', 'advanced']),
});

export const LogWorkoutBody = z.object({
  date: DateString,
  routineDayLabel: z.string().min(1).max(50),
  notes: z.string().max(500).optional(),
  sets: z.array(z.object({
    exerciseName: z.string().min(1).max(100),
    setNumber: z.number().int().min(1).max(20),
    reps: z.number().int().min(0).max(100),
    weightKg: z.number().min(0).max(500),
  })).min(1),
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: validation schemas for routine and workout routes"
```

---

### Task 5: API routes — routine, routine suggestions, workout logging

**Files:**
- Create: `src/app/api/routine/route.ts`, `src/app/api/routine/suggestions/route.ts`, `src/app/api/workout/route.ts`

**Interfaces:**
- Consumes: all query functions from Task 3, `generateRoutine`/`suggestNextPerformance` from `@/lib/routine` (Task 2), validation schemas from Task 4, `db` from `@/db`.
- Produces (all JSON; errors `{ error: string }` with 400):
  - `GET /api/routine` → `{ routine: Routine | null }`
  - `POST /api/routine` body = `GenerateRoutineBody` → generates days via `generateRoutine`, archives any existing active routine, creates the new one, returns `{ routine }`
  - `GET /api/routine/suggestions?exercise=<name>&repMin=<n>&repMax=<n>` → `{ suggestion: { weightKg, reps } | null }` (400 if `exercise` missing or `repMin`/`repMax` not finite numbers)
  - `POST /api/workout` body = `LogWorkoutBody` → creates a workout session, inserts its set logs, marks that date as a gym day via `upsertDayLog`, and advances the active routine's day index (if one exists); returns `{ ok: true, sessionId }`

- [ ] **Step 1: Implement `/api/routine`**

Create `src/app/api/routine/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { createRoutine, getActiveRoutine } from '@/db/queries';
import { generateRoutine } from '@/lib/routine';
import { GenerateRoutineBody } from '@/lib/validate';

export async function GET() {
  return NextResponse.json({ routine: await getActiveRoutine(db) });
}

export async function POST(req: Request) {
  const parsed = GenerateRoutineBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
  }
  const days = generateRoutine(parsed.data);
  const routine = await createRoutine(db, { ...parsed.data, days });
  return NextResponse.json({ routine });
}
```

- [ ] **Step 2: Implement `/api/routine/suggestions`**

Create `src/app/api/routine/suggestions/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { getLastSetsForExercise } from '@/db/queries';
import { suggestNextPerformance } from '@/lib/routine';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const exercise = searchParams.get('exercise') ?? '';
  const repMin = Number(searchParams.get('repMin'));
  const repMax = Number(searchParams.get('repMax'));
  if (!exercise || !Number.isFinite(repMin) || !Number.isFinite(repMax)) {
    return NextResponse.json({ error: 'Missing or invalid exercise/repMin/repMax' }, { status: 400 });
  }
  const lastSets = await getLastSetsForExercise(db, exercise);
  return NextResponse.json({ suggestion: suggestNextPerformance(lastSets, repMin, repMax) });
}
```

- [ ] **Step 3: Implement `/api/workout`**

Create `src/app/api/workout/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { addSetLogs, advanceRoutineDay, createWorkoutSession, getActiveRoutine, upsertDayLog } from '@/db/queries';
import { LogWorkoutBody } from '@/lib/validate';

export async function POST(req: Request) {
  const parsed = LogWorkoutBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
  }
  const { date, routineDayLabel, notes, sets } = parsed.data;
  const session = await createWorkoutSession(db, { date, routineDayLabel, notes });
  await addSetLogs(db, session.id, sets);
  await upsertDayLog(db, date, { isGymDay: true });
  const routine = await getActiveRoutine(db);
  if (routine) await advanceRoutineDay(db, routine.id);
  return NextResponse.json({ ok: true, sessionId: session.id });
}
```

- [ ] **Step 4: Verify build**

Run: `npm run test` → all pass.
Run: `npm run build` → succeeds, lists `/api/routine`, `/api/routine/suggestions`, `/api/workout`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: routine, suggestions, and workout logging API routes"
```

---

### Task 6: Train page skeleton and routine builder

**Files:**
- Create: `src/components/train/RoutineBuilder.tsx`
- Modify: `src/app/(app)/train/page.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `Profile`, `Routine` types from `@/db/queries`.
- Produces: `TrainPage` fetches `/api/profile` and `/api/routine` on mount; when there is no active routine (or the user clicks "Rebuild routine"), renders `RoutineBuilder`; `RoutineBuilder` calls `POST /api/routine` and invokes `onBuilt` (the page's `reload`) on success. This task establishes the page's state shape (`profile`, `routine`, `reload()`) that Task 7 builds on.

- [ ] **Step 1: Implement `RoutineBuilder`**

Create `src/components/train/RoutineBuilder.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { Profile } from '@/db/queries';

const inputCls = 'w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-50 outline-none focus:border-blue-500';
const labelCls = 'mb-1.5 block text-[11px] uppercase tracking-wider text-gray-500';

export default function RoutineBuilder({
  profile,
  onBuilt,
}: {
  profile: Profile | null;
  onBuilt: () => Promise<void>;
}) {
  const [goal, setGoal] = useState(profile?.goal ?? 'fat_loss');
  const [daysPerWeek, setDaysPerWeek] = useState(String(profile?.gymDaysPerWeek ?? 4));
  const [experience, setExperience] = useState(profile?.experience ?? 'intermediate');
  const [status, setStatus] = useState('');

  async function build() {
    const res = await fetch('/api/routine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal, daysPerWeek: parseInt(daysPerWeek, 10), experience }),
    });
    if (res.ok) {
      setStatus('');
      await onBuilt();
    } else {
      setStatus('Failed to build routine — try again');
    }
  }

  return (
    <div className="rounded-xl bg-gray-900 p-4">
      <div className="mb-3 text-sm font-semibold text-gray-50">Build your routine</div>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Goal</label>
          <select className={inputCls} value={goal} onChange={(e) => setGoal(e.target.value as typeof goal)}>
            <option value="fat_loss">Fat Loss</option>
            <option value="maintain">Maintain</option>
            <option value="muscle_gain">Muscle Gain</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Days / week</label>
          <select className={inputCls} value={daysPerWeek} onChange={(e) => setDaysPerWeek(e.target.value)}>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}x / week</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Experience</label>
          <select className={inputCls} value={experience} onChange={(e) => setExperience(e.target.value as typeof experience)}>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>
        <button onClick={build} className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white">
          Build Routine
        </button>
        {status && <p className="text-xs text-red-400">{status}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace the Train page placeholder**

Replace `src/app/(app)/train/page.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Profile, Routine } from '@/db/queries';
import RoutineBuilder from '@/components/train/RoutineBuilder';

export default function TrainPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);

  const reload = useCallback(async () => {
    const [p, r] = await Promise.all([
      fetch('/api/profile').then((res) => res.json()),
      fetch('/api/routine').then((res) => res.json()),
    ]);
    setProfile(p.profile);
    setRoutine(r.routine);
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void reload(); }, [reload]);

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Loading…</div>;
  }

  return (
    <div className="space-y-5 p-5">
      <h1 className="text-xl font-bold text-gray-50">Train</h1>
      {routine && !rebuilding ? (
        <button onClick={() => setRebuilding(true)} className="text-xs text-gray-500 underline">
          Rebuild routine
        </button>
      ) : (
        <RoutineBuilder profile={profile} onBuilt={async () => { setRebuilding(false); await reload(); }} />
      )}
    </div>
  );
}
```

Note: the condition is `routine && !rebuilding` (rather than a separate `showBuilder` boolean) specifically so TypeScript narrows `routine` to non-null inside that branch — Task 7 replaces this branch's content, and needs that narrowing to pass `routine` (not `routine!`) to `WorkoutChecklist`/`WeeklyRoutineView`.

- [ ] **Step 3: Verify**

Run: `npm run test` → all pass. Run: `npm run build` → succeeds.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: train page skeleton and routine builder"
```

---

### Task 7: Weekly routine view and today's workout checklist

**Files:**
- Create: `src/components/train/WeeklyRoutineView.tsx`, `src/components/train/WorkoutChecklist.tsx`
- Modify: `src/app/(app)/train/page.tsx` (replace the `else` branch from Task 6)

**Interfaces:**
- Consumes: `Routine` type from `@/db/queries`; `todayLocalISO` from `@/lib/dates`.
- Produces: `WorkoutChecklist` fetches a progression suggestion per exercise from `/api/routine/suggestions` on mount, renders editable set rows pre-filled from those suggestions, and on submit POSTs to `/api/workout` then calls `onLogged` (the page's `reload`, which re-fetches the routine — picking up the advanced `currentDayIndex`). `WeeklyRoutineView` is a read-only render of all of `routine.days`, highlighting the current day.

- [ ] **Step 1: Implement `WeeklyRoutineView`**

Create `src/components/train/WeeklyRoutineView.tsx`:

```tsx
import type { Routine } from '@/db/queries';

export default function WeeklyRoutineView({ routine }: { routine: Routine }) {
  return (
    <div className="rounded-xl bg-gray-900 p-4">
      <div className="mb-3 text-sm font-semibold text-gray-50">Weekly Routine</div>
      <div className="space-y-3">
        {routine.days.map((day, i) => (
          <div
            key={day.label + i}
            className={`rounded-lg p-3 ${i === routine.currentDayIndex ? 'border border-blue-700 bg-blue-900/40' : 'bg-gray-800'}`}
          >
            <div className="mb-1 text-sm font-semibold text-gray-200">{day.label}</div>
            <div className="text-xs text-gray-500">
              {day.exercises.map((e) => `${e.name} (${e.sets}×${e.repMin}-${e.repMax})`).join(' · ')}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement `WorkoutChecklist`**

Create `src/components/train/WorkoutChecklist.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { Routine } from '@/db/queries';
import { todayLocalISO } from '@/lib/dates';

interface SetRow {
  reps: string;
  weightKg: string;
}

const inputCls = 'w-16 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-right text-sm text-gray-50 outline-none focus:border-blue-500';

export default function WorkoutChecklist({
  routine,
  onLogged,
}: {
  routine: Routine;
  onLogged: () => Promise<void>;
}) {
  const day = routine.days[routine.currentDayIndex];
  const [rows, setRows] = useState<Record<string, SetRow[]>>({});
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const initial: Record<string, SetRow[]> = {};
      for (const exercise of day.exercises) {
        const res = await fetch(
          `/api/routine/suggestions?exercise=${encodeURIComponent(exercise.name)}&repMin=${exercise.repMin}&repMax=${exercise.repMax}`,
        ).then((r) => r.json());
        const suggestion = res.suggestion;
        initial[exercise.name] = Array.from({ length: exercise.sets }, () => ({
          reps: suggestion ? String(suggestion.reps) : '',
          weightKg: suggestion ? String(suggestion.weightKg) : '',
        }));
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRows(initial);
    })();
  }, [day]);

  function updateSet(exerciseName: string, index: number, field: keyof SetRow, value: string) {
    setRows((prev) => {
      const next = { ...prev, [exerciseName]: [...(prev[exerciseName] ?? [])] };
      next[exerciseName][index] = { ...next[exerciseName][index], [field]: value };
      return next;
    });
  }

  async function submit() {
    setSubmitting(true);
    const sets = day.exercises.flatMap((exercise) =>
      (rows[exercise.name] ?? []).map((row, i) => ({
        exerciseName: exercise.name,
        setNumber: i + 1,
        reps: parseInt(row.reps, 10) || 0,
        weightKg: parseFloat(row.weightKg) || 0,
      })),
    );
    const res = await fetch('/api/workout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: todayLocalISO(), routineDayLabel: day.label, sets }),
    });
    if (res.ok) {
      setStatus('Workout logged!');
      await onLogged();
    } else {
      setStatus('Failed to log workout — try again');
    }
    setSubmitting(false);
  }

  return (
    <div className="rounded-xl bg-gray-900 p-4">
      <div className="mb-3 text-sm font-semibold text-gray-50">Today: {day.label}</div>
      <div className="space-y-4">
        {day.exercises.map((exercise) => (
          <div key={exercise.name}>
            <div className="mb-1.5 text-sm text-gray-200">
              {exercise.name}{' '}
              <span className="text-xs text-gray-500">({exercise.repMin}-{exercise.repMax} reps)</span>
            </div>
            <div className="space-y-1.5">
              {(rows[exercise.name] ?? []).map((row, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="w-10">Set {i + 1}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={row.reps}
                    onChange={(e) => updateSet(exercise.name, i, 'reps', e.target.value)}
                    placeholder="reps"
                    className={inputCls}
                  />
                  <span>×</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    value={row.weightKg}
                    onChange={(e) => updateSet(exercise.name, i, 'weightKg', e.target.value)}
                    placeholder="kg"
                    className={inputCls}
                  />
                  <span>kg</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={submit}
        disabled={submitting}
        className="mt-4 w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {submitting ? 'Logging…' : 'Log Workout'}
      </button>
      {status && <p className="mt-2 text-xs text-emerald-400">{status}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Wire both components into the Train page**

Edit `src/app/(app)/train/page.tsx` — add imports:

```ts
import WeeklyRoutineView from '@/components/train/WeeklyRoutineView';
import WorkoutChecklist from '@/components/train/WorkoutChecklist';
```

Replace the branch rendered when `routine && !rebuilding` (currently just the "Rebuild routine" button) so it also renders the checklist and weekly view:

```tsx
      {routine && !rebuilding ? (
        <>
          <WorkoutChecklist routine={routine} onLogged={reload} />
          <WeeklyRoutineView routine={routine} />
          <button onClick={() => setRebuilding(true)} className="text-xs text-gray-500 underline">
            Rebuild routine
          </button>
        </>
      ) : (
        <RoutineBuilder profile={profile} onBuilt={async () => { setRebuilding(false); await reload(); }} />
      )}
```

`routine` is non-null inside this branch because TypeScript narrows it through the `routine && !rebuilding` condition directly (see Task 6's note on why the condition is written this way instead of using a separate boolean variable).

- [ ] **Step 4: Verify**

Run: `npm run test` → all pass. Run: `npm run build` → succeeds.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: weekly routine view and today's workout checklist with progression suggestions"
```

---

### Task 8: End-to-end verification and deploy

**Files:** none created — verification task.

**Interfaces:**
- Consumes: everything above, plus the existing `DATABASE_URL` in `.env.local` (Neon).

- [ ] **Step 1: Migrate**

```bash
cd "/Users/darryltan/Calorie App"
set -a && source .env.local && set +a
npm run db:migrate
```

Expected: applies the new migration for `routines`, `workout_sessions`, `set_logs`.

- [ ] **Step 2: Walk the flows via curl**

Start `npm run dev`, log in, then (persist cookies with `-c /tmp/cj -b /tmp/cj`):

1. `GET /api/routine` → `{"routine":null}` (no routine yet, assuming a fresh test — if one exists from prior manual testing, skip to step 4).
2. `POST /api/routine` `{"goal":"fat_loss","daysPerWeek":3,"experience":"beginner"}` → `{"routine":{...}}` with 3 days (`Full Body A`, `Full Body B`, `Full Body A`), `currentDayIndex: 0`.
3. `GET /api/routine/suggestions?exercise=Barbell Squat&repMin=10&repMax=15` → `{"suggestion":null}` (never logged).
4. `POST /api/workout` with a valid body logging all exercises from day 0 (`Full Body A`) with reps/weights → `{"ok":true,"sessionId":...}`.
5. `GET /api/routine` → `currentDayIndex` is now `1`.
6. `GET /api/routine/suggestions?exercise=Barbell Squat&repMin=10&repMax=15` → non-null suggestion reflecting step 4's logged sets.
7. `GET /api/day?date=<today>` → `isGymDay: true` (set automatically by the workout log).

- [ ] **Step 3: Browser walkthrough**

Confirm on the Train tab: building a routine renders the weekly view and today's checklist; suggestions pre-fill set rows (blank on first-ever log for an exercise); logging a workout advances to the next day and updates the highlighted day in the weekly view; the Today tab's gym/rest toggle reflects the workout-driven gym day; rebuilding a routine works and a subsequent log for an exercise that exists in both the old and new routine still shows the correct progression suggestion (per the confirmed scope decision).

- [ ] **Step 4: Fix anything found, run full suite, commit if changed**

```bash
npm run test && npm run build
```

Only commit if fixes were made:

```bash
git add -A && git commit -m "test: verified end-to-end routine and workout flows against real Postgres"
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
- Train tab live in production: build/rebuild a routine, see the weekly plan, log today's rotation day with progression-suggested sets, and have that advance the rotation and mark the day as a gym day.
- Progression suggestions persist per exercise name across routine rebuilds.
