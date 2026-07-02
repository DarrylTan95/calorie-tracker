# Fuel Log Phase 1: Foundation & Profile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployed, password-protected Next.js app with the full Profile experience: profile editing, weight logging, calculated calorie/macro targets with manual overrides, and the five-tab app shell (other tabs as placeholders).

**Architecture:** Next.js App Router (one codebase for UI + API routes) on Vercel, Neon Postgres via Drizzle ORM, single-password auth via iron-session cookie. All "smart" logic (target calculation, overrides) is pure functions in `src/lib`, unit-tested with Vitest; data access is a thin queries module integration-tested against in-memory PGlite.

**Tech Stack:** Next.js (App Router, TypeScript, Tailwind), Drizzle ORM + postgres-js, Neon Postgres, iron-session, zod, Vitest, @electric-sql/pglite (tests only).

**Spec:** `docs/superpowers/specs/2026-07-02-fuel-log-app-design.md`. This is plan 1 of 4 (Phase 2: food logging/Today; Phase 3: training/Train; Phase 4: coach reviews + History + PWA polish).

## Global Constraints

- TypeScript strict mode; no `any` in committed code.
- Single-user app: no `user_id` columns anywhere; `profile` is a single row with `id = 1`.
- All dates are client-supplied `YYYY-MM-DD` strings. The server NEVER computes "today" (Vercel runs UTC; the user is in Singapore).
- Dark theme only. Palette carried from the prototype: bg `#0a0f1a`, card `#111827`, accent blue `#60a5fa`/`#2563eb`, text `#e5e7eb`, muted `#6b7280`.
- Target formulas must match the prototype exactly (verified by unit test): TDEE gym = round(weight × 28.2), rest = round(weight × 24.1); fat_loss −450 gym / −400 rest; muscle_gain +300 / +250; protein 2 g/kg (2.2 for muscle_gain); water 2.5 L.
- Env vars: `DATABASE_URL`, `SESSION_SECRET` (32+ chars), `AUTH_PASSWORD_HASH` (sha256 hex of the password). Never commit real values; `.env.local` is gitignored.
- Commit after every task (steps say when). Run `npm run test` before every commit.
- Working directory for all commands: `/Users/darryltan/Calorie App`.

---

### Task 1: Scaffold Next.js project with Vitest harness

**Files:**
- Create: entire Next.js scaffold (via create-next-app), `vitest.config.ts`, `tests/smoke.test.ts`
- Modify: `package.json` (name, test script)

**Interfaces:**
- Produces: `npm run dev` (app on :3000), `npm run test` (Vitest), `@/*` alias → `src/*`.

- [ ] **Step 1: Verify Node version**

Run: `node -v`
Expected: v20.x or higher. If lower, stop and report.

- [ ] **Step 2: Scaffold (create-next-app refuses non-empty dirs, so scaffold to a temp dir and copy over)**

```bash
cd "/Users/darryltan/Calorie App"
npx --yes create-next-app@latest fuel-log-tmp --yes --typescript --tailwind --eslint --app --src-dir --use-npm --import-alias "@/*"
rsync -a --exclude='.git' fuel-log-tmp/ .
rm -rf fuel-log-tmp
npm install
```

Then edit `package.json`: set `"name": "fuel-log"`.

- [ ] **Step 3: Verify dev server**

Run: `npm run build`
Expected: build succeeds. (Faster and more deterministic than eyeballing the dev server.)

- [ ] **Step 4: Add Vitest**

```bash
npm install -D vitest
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
```

Add to `package.json` scripts: `"test": "vitest run"`.

Create `tests/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run tests**

Run: `npm run test`
Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js app with Vitest harness"
```

---

### Task 2: Targets engine (pure functions, TDD)

**Files:**
- Create: `src/lib/targets.ts`
- Test: `tests/targets.test.ts`

**Interfaces:**
- Produces:
  - `type Goal = 'fat_loss' | 'maintain' | 'muscle_gain'`
  - `interface Targets { caloriesGym; caloriesRest; protein; carbsGymMin; carbsGymMax; carbsRestMin; carbsRestMax; fatMin; fatMax; water; tdeeGym; tdeeRest }` (all `number`)
  - `type OverrideKey = 'caloriesGym'|'caloriesRest'|'protein'|'carbsGymMin'|'carbsGymMax'|'carbsRestMin'|'carbsRestMax'|'fatMin'|'fatMax'|'water'`
  - `type Overrides = Partial<Record<OverrideKey, number>>`
  - `calcTargets(input: { weightKg: number; goal: Goal }): Targets`
  - `applyOverrides(t: Targets, o: Overrides): Targets`

- [ ] **Step 1: Write failing tests**

Create `tests/targets.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { calcTargets, applyOverrides } from '@/lib/targets';

describe('calcTargets', () => {
  it('computes fat_loss targets at 85kg (prototype parity)', () => {
    const t = calcTargets({ weightKg: 85, goal: 'fat_loss' });
    expect(t.tdeeGym).toBe(2397); // round(85 * 28.2)
    expect(t.tdeeRest).toBe(2049); // round(85 * 24.1)
    expect(t.caloriesGym).toBe(1947); // tdeeGym - 450
    expect(t.caloriesRest).toBe(1649); // tdeeRest - 400
    expect(t.protein).toBe(170); // 2 g/kg
    expect(t.carbsGymMin).toBe(180);
    expect(t.carbsGymMax).toBe(220);
    expect(t.carbsRestMin).toBe(130);
    expect(t.carbsRestMax).toBe(160);
    expect(t.fatMin).toBe(55);
    expect(t.fatMax).toBe(70);
    expect(t.water).toBe(2.5);
  });

  it('computes muscle_gain targets at 85kg', () => {
    const t = calcTargets({ weightKg: 85, goal: 'muscle_gain' });
    expect(t.caloriesGym).toBe(2697); // tdeeGym + 300
    expect(t.caloriesRest).toBe(2299); // tdeeRest + 250
    expect(t.protein).toBe(187); // round(85 * 2.2)
    expect(t.carbsGymMax).toBe(280);
    expect(t.fatMax).toBe(85);
  });

  it('computes maintain targets at 70kg', () => {
    const t = calcTargets({ weightKg: 70, goal: 'maintain' });
    expect(t.caloriesGym).toBe(t.tdeeGym);
    expect(t.caloriesRest).toBe(t.tdeeRest);
    expect(t.protein).toBe(140);
    expect(t.carbsRestMin).toBe(150);
  });
});

describe('applyOverrides', () => {
  it('pins overridden metrics and leaves the rest calculated', () => {
    const t = calcTargets({ weightKg: 85, goal: 'fat_loss' });
    const out = applyOverrides(t, { caloriesGym: 2100, protein: 180 });
    expect(out.caloriesGym).toBe(2100);
    expect(out.protein).toBe(180);
    expect(out.caloriesRest).toBe(t.caloriesRest);
    expect(out.tdeeGym).toBe(t.tdeeGym);
  });

  it('returns identical targets for empty overrides', () => {
    const t = calcTargets({ weightKg: 85, goal: 'fat_loss' });
    expect(applyOverrides(t, {})).toEqual(t);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test`
Expected: FAIL — cannot resolve `@/lib/targets`.

- [ ] **Step 3: Implement**

Create `src/lib/targets.ts`:

```ts
export type Goal = 'fat_loss' | 'maintain' | 'muscle_gain';

export interface Targets {
  caloriesGym: number;
  caloriesRest: number;
  protein: number;
  carbsGymMin: number;
  carbsGymMax: number;
  carbsRestMin: number;
  carbsRestMax: number;
  fatMin: number;
  fatMax: number;
  water: number;
  tdeeGym: number;
  tdeeRest: number;
}

export type OverrideKey =
  | 'caloriesGym' | 'caloriesRest' | 'protein'
  | 'carbsGymMin' | 'carbsGymMax' | 'carbsRestMin' | 'carbsRestMax'
  | 'fatMin' | 'fatMax' | 'water';

export type Overrides = Partial<Record<OverrideKey, number>>;

export const OVERRIDE_KEYS: OverrideKey[] = [
  'caloriesGym', 'caloriesRest', 'protein',
  'carbsGymMin', 'carbsGymMax', 'carbsRestMin', 'carbsRestMax',
  'fatMin', 'fatMax', 'water',
];

export function calcTargets(input: { weightKg: number; goal: Goal }): Targets {
  const { weightKg: w, goal } = input;
  const tdeeGym = Math.round(w * 28.2);
  const tdeeRest = Math.round(w * 24.1);
  const gymAdj = goal === 'fat_loss' ? -450 : goal === 'muscle_gain' ? 300 : 0;
  const restAdj = goal === 'fat_loss' ? -400 : goal === 'muscle_gain' ? 250 : 0;
  const proteinMult = goal === 'muscle_gain' ? 2.2 : 2.0;
  return {
    caloriesGym: tdeeGym + gymAdj,
    caloriesRest: tdeeRest + restAdj,
    protein: Math.round(w * proteinMult),
    carbsGymMin: goal === 'muscle_gain' ? 220 : 180,
    carbsGymMax: goal === 'muscle_gain' ? 280 : 220,
    carbsRestMin: goal === 'muscle_gain' ? 160 : goal === 'maintain' ? 150 : 130,
    carbsRestMax: goal === 'muscle_gain' ? 200 : goal === 'maintain' ? 180 : 160,
    fatMin: goal === 'muscle_gain' ? 65 : 55,
    fatMax: goal === 'muscle_gain' ? 85 : 70,
    water: 2.5,
    tdeeGym,
    tdeeRest,
  };
}

export function applyOverrides(t: Targets, o: Overrides): Targets {
  const out = { ...t };
  for (const key of OVERRIDE_KEYS) {
    const v = o[key];
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: targets engine with manual overrides"
```

---

### Task 3: Database schema, migrations, and queries module

**Files:**
- Create: `src/db/schema.ts`, `src/db/index.ts`, `src/db/queries.ts`, `drizzle.config.ts`, `tests/helpers/db.ts`, `.env.local` (placeholder), generated `drizzle/` migration folder
- Test: `tests/queries.test.ts`
- Modify: `package.json` (db scripts), `.gitignore`

**Interfaces:**
- Consumes: `Goal`, `Targets`, `Overrides`, `calcTargets`, `applyOverrides` from `@/lib/targets` (Task 2).
- Produces (from `@/db/queries`, every function takes `db: DB` as first arg):
  - `type DB` (works for both postgres-js and PGlite drizzle instances)
  - `type Profile = { id: number; name: string; weightKg: number; heightCm: number; age: number; gender: 'male'|'female'; goal: Goal; gymDaysPerWeek: number; experience: 'beginner'|'intermediate'|'advanced' }`
  - `getProfile(db): Promise<Profile | null>`
  - `saveProfile(db, p: Omit<Profile, 'id'>): Promise<Profile>` (upsert of row id=1)
  - `logWeight(db, entry: { date: string; weightKg: number }): Promise<void>` (upserts weight_log row AND updates profile.weightKg)
  - `getWeightLog(db, limit?: number): Promise<{ date: string; weightKg: number }[]>` (descending by date)
  - `getOverrides(db): Promise<Overrides>` (latest targets row's overrides, `{}` if none)
  - `saveOverrides(db, overrides: Overrides, effectiveFrom: string): Promise<void>` (inserts a new targets history row snapshotting current calculated values)
- Produces (from `@/db/index`): `db` — app-wide drizzle instance connected via `DATABASE_URL`.

- [ ] **Step 1: Install dependencies**

```bash
npm install drizzle-orm postgres
npm install -D drizzle-kit @electric-sql/pglite
```

- [ ] **Step 2: Write schema and config**

Create `src/db/schema.ts`:

```ts
import { pgTable, serial, text, real, integer, date, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const profile = pgTable('profile', {
  id: integer('id').primaryKey(),
  name: text('name').notNull().default(''),
  weightKg: real('weight_kg').notNull(),
  heightCm: real('height_cm').notNull(),
  age: integer('age').notNull(),
  gender: text('gender', { enum: ['male', 'female'] }).notNull(),
  goal: text('goal', { enum: ['fat_loss', 'maintain', 'muscle_gain'] }).notNull(),
  gymDaysPerWeek: integer('gym_days_per_week').notNull(),
  experience: text('experience', { enum: ['beginner', 'intermediate', 'advanced'] }).notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const targets = pgTable('targets', {
  id: serial('id').primaryKey(),
  effectiveFrom: date('effective_from').notNull(),
  calculated: jsonb('calculated').notNull(),
  overrides: jsonb('overrides').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const weightLog = pgTable('weight_log', {
  date: date('date').primaryKey(),
  weightKg: real('weight_kg').notNull(),
});
```

Create `drizzle.config.ts`:

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
```

Create `src/db/index.ts`:

```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
export const db = drizzle(client, { schema });
```

Create `.env.local` (gitignored — verify `.env*` is in `.gitignore`, add if missing):

```
DATABASE_URL=postgres://placeholder-until-neon-setup
SESSION_SECRET=dev-only-secret-change-me-32-chars!!
AUTH_PASSWORD_HASH=
```

Add to `package.json` scripts: `"db:generate": "drizzle-kit generate"`, `"db:migrate": "drizzle-kit migrate"`.

- [ ] **Step 3: Generate migration**

Run: `npm run db:generate`
Expected: creates `drizzle/0000_*.sql` containing the three CREATE TABLE statements.

- [ ] **Step 4: Write failing queries tests**

Create `tests/helpers/db.ts`:

```ts
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '@/db/schema';

export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: './drizzle' });
  return db;
}
```

Create `tests/queries.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers/db';
import {
  getProfile, saveProfile, logWeight, getWeightLog, getOverrides, saveOverrides, type DB,
} from '@/db/queries';

const BASE_PROFILE = {
  name: 'Darryl', weightKg: 85, heightCm: 170, age: 31,
  gender: 'male' as const, goal: 'fat_loss' as const,
  gymDaysPerWeek: 4, experience: 'intermediate' as const,
};

let db: DB;
beforeEach(async () => { db = await createTestDb(); });

describe('profile', () => {
  it('returns null before any save', async () => {
    expect(await getProfile(db)).toBeNull();
  });

  it('saves then updates the single profile row', async () => {
    await saveProfile(db, BASE_PROFILE);
    await saveProfile(db, { ...BASE_PROFILE, weightKg: 84 });
    const p = await getProfile(db);
    expect(p?.id).toBe(1);
    expect(p?.weightKg).toBe(84);
  });
});

describe('weight log', () => {
  it('upserts by date, returns descending, and updates profile weight', async () => {
    await saveProfile(db, BASE_PROFILE);
    await logWeight(db, { date: '2026-07-01', weightKg: 85.2 });
    await logWeight(db, { date: '2026-07-02', weightKg: 84.8 });
    await logWeight(db, { date: '2026-07-02', weightKg: 84.6 }); // same-day correction
    const log = await getWeightLog(db);
    expect(log).toEqual([
      { date: '2026-07-02', weightKg: 84.6 },
      { date: '2026-07-01', weightKg: 85.2 },
    ]);
    expect((await getProfile(db))?.weightKg).toBe(84.6);
  });
});

describe('overrides', () => {
  it('returns empty overrides when none saved', async () => {
    expect(await getOverrides(db)).toEqual({});
  });

  it('returns latest saved overrides', async () => {
    await saveProfile(db, BASE_PROFILE);
    await saveOverrides(db, { caloriesGym: 2100 }, '2026-07-01');
    await saveOverrides(db, { caloriesGym: 2000, protein: 180 }, '2026-07-02');
    expect(await getOverrides(db)).toEqual({ caloriesGym: 2000, protein: 180 });
  });
});
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `npm run test`
Expected: FAIL — cannot resolve `@/db/queries`.

- [ ] **Step 6: Implement queries**

Create `src/db/queries.ts`:

```ts
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
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm run test`
Expected: all pass (targets + queries + smoke).

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: database schema, migrations, and queries module"
```

---

### Task 4: Auth — password verify, session, login page, middleware

**Files:**
- Create: `src/lib/auth.ts`, `src/lib/session-config.ts`, `src/lib/session.ts`, `src/app/api/auth/login/route.ts`, `src/app/login/page.tsx`, `src/middleware.ts`
- Test: `tests/auth.test.ts`

**Interfaces:**
- Produces:
  - `sha256Hex(s: string): string`, `verifyPassword(password: string, expectedHash?: string): boolean` from `@/lib/auth`
  - `getSession(): Promise<IronSession<SessionData>>` from `@/lib/session` (node routes) with `SessionData = { loggedIn?: boolean }`
  - `sessionOptions` from `@/lib/session-config` (shared with edge middleware)
  - `POST /api/auth/login` body `{ password: string }` → 200 `{ ok: true }` + session cookie, or 401 `{ error }`
  - Middleware: unauthenticated page hits redirect to `/login`; unauthenticated `/api/*` hits get 401 JSON.

- [ ] **Step 1: Install iron-session and zod**

```bash
npm install iron-session zod
```

- [ ] **Step 2: Write failing auth test**

Create `tests/auth.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sha256Hex, verifyPassword } from '@/lib/auth';

describe('verifyPassword', () => {
  const hash = sha256Hex('correct-horse');

  it('accepts the right password', () => {
    expect(verifyPassword('correct-horse', hash)).toBe(true);
  });

  it('rejects a wrong password', () => {
    expect(verifyPassword('wrong', hash)).toBe(false);
  });

  it('rejects when hash is missing or malformed', () => {
    expect(verifyPassword('anything', '')).toBe(false);
    expect(verifyPassword('anything', 'not-hex')).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test`
Expected: FAIL — cannot resolve `@/lib/auth`.

- [ ] **Step 4: Implement auth + session modules**

Create `src/lib/auth.ts`:

```ts
import { createHash, timingSafeEqual } from 'crypto';

export function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export function verifyPassword(
  password: string,
  expectedHash: string = process.env.AUTH_PASSWORD_HASH ?? '',
): boolean {
  if (!/^[0-9a-f]{64}$/i.test(expectedHash)) return false;
  const actual = Buffer.from(sha256Hex(password), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return timingSafeEqual(actual, expected);
}
```

Create `src/lib/session-config.ts` (no node-only imports — shared with edge middleware):

```ts
import type { SessionOptions } from 'iron-session';

export interface SessionData {
  loggedIn?: boolean;
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: 'fuel_log_session',
  ttl: 60 * 60 * 24 * 30, // 30 days
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
  },
};
```

Create `src/lib/session.ts`:

```ts
import { getIronSession, type IronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions, type SessionData } from './session-config';

export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test`
Expected: all pass.

- [ ] **Step 6: Implement login route, login page, middleware**

Create `src/app/api/auth/login/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyPassword } from '@/lib/auth';
import { getSession } from '@/lib/session';

const Body = z.object({ password: z.string().min(1) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !verifyPassword(parsed.data.password)) {
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 });
  }
  const session = await getSession();
  session.loggedIn = true;
  await session.save();
  return NextResponse.json({ ok: true });
}
```

Create `src/app/login/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    }).catch(() => null);
    if (res?.ok) {
      router.push('/profile');
      router.refresh();
    } else {
      setError('Wrong password');
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gray-50 tracking-tight mb-1">FUEL LOG</h1>
        <p className="text-sm text-gray-500 mb-6">Enter your password to continue.</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-3 text-gray-50 text-sm outline-none focus:border-blue-500 mb-3"
        />
        {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
```

Create `src/middleware.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, type SessionData } from '@/lib/session-config';

const PUBLIC_PATHS = ['/login', '/api/auth/login'];

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(request, response, sessionOptions);
  const { pathname } = request.nextUrl;

  if (session.loggedIn || PUBLIC_PATHS.includes(pathname)) return response;

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/).*)'],
};
```

- [ ] **Step 7: Set a dev password hash and verify manually**

```bash
node -e "console.log(require('crypto').createHash('sha256').update('devpass').digest('hex'))"
```

Put the output in `.env.local` as `AUTH_PASSWORD_HASH=<hex>`.

Run: `npm run dev` (background), then:
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/profile` → expect `401`
- `curl -s -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"password":"devpass"}'` → expect `{"ok":true}`
- `curl -s -X POST ... -d '{"password":"nope"}'` → expect 401 `{"error":"Wrong password"}`
- Visiting `http://localhost:3000/` in a browser redirects to `/login`.

Stop the dev server.

- [ ] **Step 8: Run tests, build, commit**

Run: `npm run test` → all pass. Run: `npm run build` → succeeds.

```bash
git add -A && git commit -m "feat: single-password auth with iron-session and route protection"
```

---

### Task 5: Profile, weight, and targets API routes

**Files:**
- Create: `src/app/api/profile/route.ts`, `src/app/api/weight/route.ts`, `src/app/api/targets/route.ts`, `src/lib/validate.ts`
- Test: `tests/validate.test.ts`

**Interfaces:**
- Consumes: `db` (Task 3), queries (Task 3), `calcTargets`/`applyOverrides` (Task 2). Auth is enforced by middleware (Task 4) — routes assume authenticated.
- Produces (all JSON; errors are `{ error: string }` with 400/500):
  - `GET /api/profile` → `{ profile: Profile | null }`
  - `PUT /api/profile` body = ProfileBody (below) → `{ profile: Profile }`
  - `GET /api/weight` → `{ entries: { date: string; weightKg: number }[] }`
  - `POST /api/weight` body `{ date: 'YYYY-MM-DD', weightKg: 30–300 }` → `{ entries: [...] }` (fresh list)
  - `GET /api/targets` → `{ calculated: Targets, overrides: Overrides, effective: Targets } | { error }` (404 if no profile yet)
  - `PUT /api/targets` body `{ overrides: Overrides, effectiveFrom: 'YYYY-MM-DD' }` → same shape as GET

- [ ] **Step 1: Write failing validation tests**

Create `tests/validate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ProfileBody, WeightBody, TargetsBody } from '@/lib/validate';

describe('ProfileBody', () => {
  const valid = {
    name: 'D', weightKg: 85, heightCm: 170, age: 31,
    gender: 'male', goal: 'fat_loss', gymDaysPerWeek: 4, experience: 'intermediate',
  };

  it('accepts a valid profile', () => {
    expect(ProfileBody.safeParse(valid).success).toBe(true);
  });

  it('rejects out-of-range and wrong-enum values', () => {
    expect(ProfileBody.safeParse({ ...valid, weightKg: 10 }).success).toBe(false);
    expect(ProfileBody.safeParse({ ...valid, goal: 'get_shredded' }).success).toBe(false);
    expect(ProfileBody.safeParse({ ...valid, gymDaysPerWeek: 8 }).success).toBe(false);
  });
});

describe('WeightBody', () => {
  it('accepts valid, rejects bad date format and range', () => {
    expect(WeightBody.safeParse({ date: '2026-07-02', weightKg: 84.5 }).success).toBe(true);
    expect(WeightBody.safeParse({ date: '02/07/2026', weightKg: 84.5 }).success).toBe(false);
    expect(WeightBody.safeParse({ date: '2026-07-02', weightKg: 500 }).success).toBe(false);
  });
});

describe('TargetsBody', () => {
  it('accepts known override keys only, and requires positive numbers', () => {
    expect(TargetsBody.safeParse({ overrides: { caloriesGym: 2100 }, effectiveFrom: '2026-07-02' }).success).toBe(true);
    expect(TargetsBody.safeParse({ overrides: { nonsense: 1 }, effectiveFrom: '2026-07-02' }).success).toBe(false);
    expect(TargetsBody.safeParse({ overrides: { protein: -5 }, effectiveFrom: '2026-07-02' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test`
Expected: FAIL — cannot resolve `@/lib/validate`.

- [ ] **Step 3: Implement validation schemas**

Create `src/lib/validate.ts`:

```ts
import { z } from 'zod';
import { OVERRIDE_KEYS } from './targets';

export const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

export const ProfileBody = z.object({
  name: z.string().max(100),
  weightKg: z.number().min(30).max(300),
  heightCm: z.number().min(100).max(250),
  age: z.number().int().min(10).max(120),
  gender: z.enum(['male', 'female']),
  goal: z.enum(['fat_loss', 'maintain', 'muscle_gain']),
  gymDaysPerWeek: z.number().int().min(1).max(7),
  experience: z.enum(['beginner', 'intermediate', 'advanced']),
});

export const WeightBody = z.object({
  date: DateString,
  weightKg: z.number().min(30).max(300),
});

// Built as a strict object (not z.record) so unknown keys are rejected
// consistently across zod versions.
const overrideShape = Object.fromEntries(
  OVERRIDE_KEYS.map((k) => [k, z.number().positive().optional()]),
);
export const TargetsBody = z.object({
  overrides: z.object(overrideShape).strict(),
  effectiveFrom: DateString,
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test`
Expected: all pass.

- [ ] **Step 5: Implement the three route files**

Create `src/app/api/profile/route.ts`:

```ts
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
```

Create `src/app/api/weight/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { getWeightLog, logWeight } from '@/db/queries';
import { WeightBody } from '@/lib/validate';

export async function GET() {
  return NextResponse.json({ entries: await getWeightLog(db) });
}

export async function POST(req: Request) {
  const parsed = WeightBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
  }
  await logWeight(db, parsed.data);
  return NextResponse.json({ entries: await getWeightLog(db) });
}
```

Create `src/app/api/targets/route.ts`:

```ts
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
```

- [ ] **Step 6: Verify build compiles routes**

Run: `npm run build`
Expected: succeeds, lists `/api/profile`, `/api/weight`, `/api/targets` routes. (Live behaviour is verified end-to-end in Task 7 against a real database.)

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: profile, weight, and targets API routes with zod validation"
```

---

### Task 6: App shell — dark theme, tab navigation, placeholder pages

**Files:**
- Create: `src/components/TabBar.tsx`, `src/app/(app)/layout.tsx`, `src/app/(app)/today/page.tsx`, `src/app/(app)/train/page.tsx`, `src/app/(app)/coach/page.tsx`, `src/app/(app)/history/page.tsx`, `src/app/(app)/profile/page.tsx` (placeholder, replaced in Task 7)
- Modify: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: nothing app-specific.
- Produces: route group `(app)` whose layout renders children + `<TabBar />`; five tabs at `/today`, `/train`, `/coach`, `/history`, `/profile`; `/` redirects to `/today`.

- [ ] **Step 1: Set global theme**

Replace `src/app/globals.css` content with:

```css
@import "tailwindcss";

:root {
  --background: #0a0f1a;
  --foreground: #e5e7eb;
}

body {
  background: var(--background);
  color: var(--foreground);
}
```

Replace `src/app/layout.tsx` with:

```tsx
import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Fuel Log',
  description: 'Calorie tracking with a built-in training coach',
};

export const viewport: Viewport = {
  themeColor: '#0a0f1a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
```

Replace `src/app/page.tsx` with:

```tsx
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/today');
}
```

- [ ] **Step 2: Build TabBar and (app) layout**

Create `src/components/TabBar.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/today', label: 'Today', icon: '🍽' },
  { href: '/train', label: 'Train', icon: '🏋' },
  { href: '/coach', label: 'Coach', icon: '📈' },
  { href: '/history', label: 'History', icon: '🗓' },
  { href: '/profile', label: 'Profile', icon: '👤' },
];

export default function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-10 border-t border-gray-800 bg-[#0a0f1a]/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-lg">
        {TABS.map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${
                active ? 'text-blue-400' : 'text-gray-500'
              }`}
            >
              <span className="text-base leading-none">{tab.icon}</span>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

Create `src/app/(app)/layout.tsx`:

```tsx
import TabBar from '@/components/TabBar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-screen max-w-lg pb-24">
      {children}
      <TabBar />
    </div>
  );
}
```

Create identical placeholder pages — `src/app/(app)/today/page.tsx`, `src/app/(app)/train/page.tsx`, `src/app/(app)/coach/page.tsx`, `src/app/(app)/history/page.tsx` — each with its own name/phase, e.g. for Today:

```tsx
export default function TodayPage() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-gray-50">Today</h1>
      <p className="mt-2 text-sm text-gray-500">Food logging arrives in Phase 2.</p>
    </div>
  );
}
```

(Train → "Workout logging arrives in Phase 3."; Coach → "Weekly reviews arrive in Phase 4."; History → "History arrives in Phase 4.")

Create `src/app/(app)/profile/page.tsx` placeholder (replaced in Task 7):

```tsx
export default function ProfilePage() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-gray-50">Profile</h1>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npm run build` → succeeds with all five routes.
Run dev server briefly and confirm `/` redirects to `/today` after login and the tab bar navigates between the five pages.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: app shell with dark theme and five-tab navigation"
```

---

### Task 7: Profile page UI

**Files:**
- Create: `src/components/profile/ProfileStats.tsx`, `src/components/profile/WeightSection.tsx`, `src/components/profile/ProfileForm.tsx`, `src/components/profile/TargetsTable.tsx`, `src/lib/dates.ts`
- Modify: `src/app/(app)/profile/page.tsx` (replace placeholder)
- Test: `tests/dates.test.ts`

**Interfaces:**
- Consumes: API routes from Task 5; `Targets`, `Overrides`, `OverrideKey`, `Goal` types from Task 2; `Profile` type from Task 3.
- Produces: `todayLocalISO(): string` from `@/lib/dates` (client-side "today" in the device's timezone, `YYYY-MM-DD`) — reused by every later phase.

- [ ] **Step 1: Write failing date-helper test**

Create `tests/dates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { todayLocalISO } from '@/lib/dates';

describe('todayLocalISO', () => {
  it('returns YYYY-MM-DD', () => {
    expect(todayLocalISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('uses local time, not UTC', () => {
    // Construct from a known Date: 2026-07-02T01:00 local
    expect(todayLocalISO(new Date(2026, 6, 2, 1, 0))).toBe('2026-07-02');
  });
});
```

- [ ] **Step 2: Run test to verify it fails, then implement**

Run: `npm run test` → FAIL (cannot resolve `@/lib/dates`).

Create `src/lib/dates.ts`:

```ts
export function todayLocalISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
```

Run: `npm run test` → all pass.

- [ ] **Step 3: Build the Profile page and components**

Replace `src/app/(app)/profile/page.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Profile } from '@/db/queries';
import type { Overrides, Targets } from '@/lib/targets';
import ProfileStats from '@/components/profile/ProfileStats';
import WeightSection from '@/components/profile/WeightSection';
import ProfileForm from '@/components/profile/ProfileForm';
import TargetsTable from '@/components/profile/TargetsTable';

export interface TargetsPayload {
  calculated: Targets;
  overrides: Overrides;
  effective: Targets;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [targets, setTargets] = useState<TargetsPayload | null>(null);
  const [weightLog, setWeightLog] = useState<{ date: string; weightKg: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [p, t, w] = await Promise.all([
      fetch('/api/profile').then((r) => r.json()),
      fetch('/api/targets').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/weight').then((r) => r.json()),
    ]);
    setProfile(p.profile);
    setTargets(t);
    setWeightLog(w.entries);
    setLoading(false);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Loading…</div>;
  }

  return (
    <div className="p-5 space-y-5">
      <h1 className="text-xl font-bold text-gray-50">Profile</h1>
      {profile && targets && <ProfileStats profile={profile} targets={targets.effective} />}
      {profile && <WeightSection weightLog={weightLog} onLogged={reload} />}
      <ProfileForm profile={profile} onSaved={reload} />
      {targets && <TargetsTable payload={targets} onChanged={reload} />}
    </div>
  );
}
```

Create `src/components/profile/ProfileStats.tsx`:

```tsx
import type { Profile } from '@/db/queries';
import type { Targets } from '@/lib/targets';

const GOAL_LABELS = { fat_loss: 'Fat Loss', maintain: 'Maintain', muscle_gain: 'Muscle Gain' } as const;

export default function ProfileStats({ profile, targets }: { profile: Profile; targets: Targets }) {
  const bmi = profile.weightKg / (profile.heightCm / 100) ** 2;
  const bmiLabel = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese';
  const stats = [
    { val: `${profile.weightKg}kg`, lbl: 'Weight' },
    { val: bmi.toFixed(1), lbl: bmiLabel },
    { val: `${targets.caloriesGym}`, lbl: 'Gym kcal' },
    { val: `${targets.protein}g`, lbl: 'Protein' },
    { val: GOAL_LABELS[profile.goal], lbl: 'Goal' },
  ];
  return (
    <div className="rounded-xl border border-blue-900/60 bg-[#0f172a] p-4">
      <div className="flex justify-around">
        {stats.map(({ val, lbl }) => (
          <div key={lbl} className="text-center">
            <div className="text-lg font-extrabold tracking-tight text-gray-50">{val}</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-wider text-gray-500">{lbl}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

Create `src/components/profile/WeightSection.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { todayLocalISO } from '@/lib/dates';

export default function WeightSection({
  weightLog,
  onLogged,
}: {
  weightLog: { date: string; weightKg: number }[];
  onLogged: () => Promise<void>;
}) {
  const [value, setValue] = useState('');
  const [status, setStatus] = useState('');
  const today = todayLocalISO();

  async function log() {
    const weightKg = parseFloat(value);
    if (!weightKg) return;
    const res = await fetch('/api/weight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: today, weightKg }),
    }).catch(() => null);
    if (res?.ok) {
      setValue('');
      setStatus('Weight logged — targets updated');
      setTimeout(() => setStatus(''), 2500);
      await onLogged();
    } else {
      setStatus('Save failed — try again');
    }
  }

  return (
    <div className="rounded-xl bg-gray-900 p-4">
      <div className="mb-2 text-[11px] uppercase tracking-wider text-gray-500">Log today&apos;s weight</div>
      <div className="flex gap-2">
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          min={30}
          max={300}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. 84.5"
          className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-50 outline-none focus:border-blue-500"
        />
        <button
          onClick={log}
          disabled={!value}
          className="rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          Log
        </button>
      </div>
      {status && <p className="mt-2 text-xs text-emerald-400">{status}</p>}
      {weightLog.length > 0 && (
        <div className="mt-3 divide-y divide-gray-800">
          {weightLog.slice(0, 10).map((e) => (
            <div key={e.date} className="flex justify-between py-2 text-sm">
              <span className="text-gray-400">{e.date === today ? 'Today' : e.date}</span>
              <span className="font-semibold text-gray-50">{e.weightKg} kg</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

Create `src/components/profile/ProfileForm.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { Profile } from '@/db/queries';

const GOALS = [
  { value: 'fat_loss', label: 'Fat Loss', desc: 'Calorie deficit · high protein · preserve muscle' },
  { value: 'maintain', label: 'Maintain Weight', desc: 'Eat at TDEE · balanced macros' },
  { value: 'muscle_gain', label: 'Muscle Gain', desc: 'Calorie surplus · high protein · build mass' },
] as const;

const DEFAULT_DRAFT = {
  name: '', weightKg: '85', heightCm: '170', age: '31',
  gender: 'male', goal: 'fat_loss', gymDaysPerWeek: '4', experience: 'intermediate',
};

const inputCls =
  'w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-50 outline-none focus:border-blue-500';
const labelCls = 'mb-1.5 block text-[11px] uppercase tracking-wider text-gray-500';

export default function ProfileForm({
  profile,
  onSaved,
}: {
  profile: Profile | null;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(DEFAULT_DRAFT);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (profile) {
      setDraft({
        name: profile.name,
        weightKg: String(profile.weightKg),
        heightCm: String(profile.heightCm),
        age: String(profile.age),
        gender: profile.gender,
        goal: profile.goal,
        gymDaysPerWeek: String(profile.gymDaysPerWeek),
        experience: profile.experience,
      });
    }
  }, [profile]);

  function set<K extends keyof typeof DEFAULT_DRAFT>(key: K, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function save() {
    const body = {
      name: draft.name,
      weightKg: parseFloat(draft.weightKg),
      heightCm: parseFloat(draft.heightCm),
      age: parseInt(draft.age, 10),
      gender: draft.gender,
      goal: draft.goal,
      gymDaysPerWeek: parseInt(draft.gymDaysPerWeek, 10),
      experience: draft.experience,
    };
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (res?.ok) {
      setStatus('Saved — targets recalculated');
      setTimeout(() => setStatus(''), 2500);
      await onSaved();
    } else {
      const err = res ? (await res.json()).error : 'Network error';
      setStatus(`Save failed: ${err}`);
    }
  }

  return (
    <div className="rounded-xl bg-gray-900 p-4">
      <div className="mb-3 text-sm font-semibold text-gray-50">
        {profile ? 'Edit Profile' : 'Set up your profile'}
      </div>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Name (optional)</label>
          <input className={inputCls} value={draft.name} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Weight (kg)</label>
            <input className={inputCls} type="number" inputMode="decimal" step="0.1" value={draft.weightKg} onChange={(e) => set('weightKg', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Height (cm)</label>
            <input className={inputCls} type="number" inputMode="numeric" value={draft.heightCm} onChange={(e) => set('heightCm', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Age</label>
            <input className={inputCls} type="number" inputMode="numeric" value={draft.age} onChange={(e) => set('age', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Gender</label>
            <select className={inputCls} value={draft.gender} onChange={(e) => set('gender', e.target.value)}>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Gym days / week</label>
            <select className={inputCls} value={draft.gymDaysPerWeek} onChange={(e) => set('gymDaysPerWeek', e.target.value)}>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}x / week</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Experience</label>
            <select className={inputCls} value={draft.experience} onChange={(e) => set('experience', e.target.value)}>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>Goal</label>
          <select className={inputCls} value={draft.goal} onChange={(e) => set('goal', e.target.value)}>
            {GOALS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
          <p className="mt-1.5 text-[11px] text-gray-500">
            {GOALS.find((g) => g.value === draft.goal)?.desc}
          </p>
        </div>
        <button onClick={save} className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white">
          Save Profile &amp; Recalculate Targets
        </button>
        {status && <p className="text-xs text-emerald-400">{status}</p>}
      </div>
    </div>
  );
}
```

Create `src/components/profile/TargetsTable.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { OverrideKey, Overrides } from '@/lib/targets';
import type { TargetsPayload } from '@/app/(app)/profile/page';
import { todayLocalISO } from '@/lib/dates';

const ROWS: { key: OverrideKey; label: string; unit: string }[] = [
  { key: 'caloriesGym', label: 'Calories — Gym day', unit: 'kcal' },
  { key: 'caloriesRest', label: 'Calories — Rest day', unit: 'kcal' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carbsGymMax', label: 'Carbs cap — Gym day', unit: 'g' },
  { key: 'carbsRestMax', label: 'Carbs cap — Rest day', unit: 'g' },
  { key: 'fatMax', label: 'Fat cap', unit: 'g' },
  { key: 'water', label: 'Water', unit: 'L' },
];

export default function TargetsTable({
  payload,
  onChanged,
}: {
  payload: TargetsPayload;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<OverrideKey | null>(null);
  const [editValue, setEditValue] = useState('');
  const [error, setError] = useState('');

  async function putOverrides(overrides: Overrides) {
    const res = await fetch('/api/targets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overrides, effectiveFrom: todayLocalISO() }),
    }).catch(() => null);
    if (res?.ok) {
      setEditing(null);
      setError('');
      await onChanged();
    } else {
      setError('Save failed — try again');
    }
  }

  function pin(key: OverrideKey) {
    const v = parseFloat(editValue);
    if (!v || v <= 0) return;
    void putOverrides({ ...payload.overrides, [key]: v });
  }

  function unpin(key: OverrideKey) {
    const next = { ...payload.overrides };
    delete next[key];
    void putOverrides(next);
  }

  return (
    <div className="rounded-xl bg-gray-900 p-4">
      <div className="mb-1 text-sm font-semibold text-gray-50">Current Targets</div>
      <p className="mb-2 text-[11px] text-gray-500">
        Tap a value to pin your own number. Pinned targets survive recalculation until unpinned.
      </p>
      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
      <div className="divide-y divide-gray-800">
        {ROWS.map(({ key, label, unit }) => {
          const pinned = payload.overrides[key] !== undefined;
          const effective = payload.effective[key];
          const calculated = payload.calculated[key];
          return (
            <div key={key} className="flex items-center justify-between py-2.5">
              <span className="text-[13px] text-gray-400">
                {label}
                {pinned && (
                  <span className="ml-2 rounded bg-amber-900/50 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">
                    PINNED
                  </span>
                )}
              </span>
              {editing === key ? (
                <span className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    type="number"
                    inputMode="decimal"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="w-20 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-right text-[13px] text-gray-50 outline-none focus:border-blue-500"
                  />
                  <button onClick={() => pin(key)} className="text-xs font-semibold text-blue-400">Pin</button>
                  <button onClick={() => setEditing(null)} className="text-xs text-gray-500">Cancel</button>
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <button
                    onClick={() => { setEditing(key); setEditValue(String(effective)); }}
                    className="text-[13px] font-semibold text-gray-200"
                  >
                    {effective} {unit}
                  </button>
                  {pinned && (
                    <button onClick={() => unpin(key)} className="text-[11px] text-gray-500 underline">
                      unpin ({calculated})
                    </button>
                  )}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `npm run test` → all pass. Run: `npm run build` → succeeds.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: profile page with weight logging, profile editing, and target overrides"
```

---

### Task 8: Local end-to-end verification against a real database

**Files:** none created — verification task. Requires a real `DATABASE_URL`.

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Point at a database**

If the user already created a Neon database, use its connection string. Otherwise run a throwaway local Postgres:

```bash
docker run -d --name fuel-log-pg -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:16
```

Set `DATABASE_URL=postgres://postgres:dev@localhost:5432/postgres` in `.env.local`. (If Docker is unavailable, pause and ask the user to create the Neon database from Task 9 first, then come back.)

- [ ] **Step 2: Migrate**

Run: `npm run db:migrate`
Expected: applies `0000_*` migration, exits 0.

- [ ] **Step 3: Walk the flows**

Start `npm run dev`, then with a browser or curl (persist cookies with `curl -c /tmp/cj -b /tmp/cj`):

1. Login with the dev password → 200.
2. `GET /api/targets` → 404 `{"error":"No profile yet"}`.
3. `PUT /api/profile` with a full valid body → 200, profile echoed.
4. `GET /api/targets` → calculated values match the targets engine (85 kg fat_loss → caloriesGym 1947).
5. `POST /api/weight` `{date: <today>, weightKg: 84.5}` → 200; `GET /api/targets` now reflects 84.5 kg (caloriesGym 1933 = round(84.5×28.2)−450).
6. `PUT /api/targets` `{overrides: {protein: 180}, effectiveFrom: <today>}` → effective.protein 180, calculated.protein unchanged.
7. In the browser: Profile page renders stats, weight log, form, targets table; pin/unpin works; other four tabs render placeholders; logout-free navigation works.

- [ ] **Step 4: Fix anything found, run full suite, commit**

Run: `npm run test` and `npm run build`.

```bash
git add -A && git commit -m "test: verified end-to-end profile flows against real Postgres"
```

(Only commit if fixes were made; otherwise skip.)

---

### Task 9: Deploy — GitHub, Neon, Vercel (CHECKPOINT: requires user)

**Files:**
- Create: `README.md` (setup + deploy notes)

**Interfaces:**
- Consumes: the whole app.
- Produces: live HTTPS URL usable from iPhone + desktop.

**This task requires the user's GitHub/Vercel/Neon accounts. Confirm each external action with the user before doing it. Do not create any remote resource without explicit go-ahead in this session.**

- [ ] **Step 1: Write README**

Create `README.md` covering: what the app is, local dev (`npm install`, `.env.local` vars with the hash-generation one-liner, `npm run db:migrate`, `npm run dev`), test (`npm run test`), and deploy summary (Neon DB → Vercel project → env vars → `npm run db:migrate` against Neon). Include the exact env var names and the note that `AUTH_PASSWORD_HASH` is `sha256 hex` of the chosen password.

- [ ] **Step 2: Confirm with user, then create private GitHub repo and push**

```bash
gh auth status   # verify the user's account
gh repo create fuel-log --private --source=. --push
```

- [ ] **Step 3: User creates Neon project (free tier)**

Ask the user to create a Neon project at neon.tech and paste the pooled connection string. Then run migrations against it:

```bash
DATABASE_URL='<neon-url>' npm run db:migrate
```

- [ ] **Step 4: User creates Vercel project**

Either the user imports the GitHub repo at vercel.com, or use `npx vercel` CLI with their login. Set env vars on Vercel: `DATABASE_URL` (Neon pooled URL), `SESSION_SECRET` (generate: `openssl rand -base64 32`), `AUTH_PASSWORD_HASH` (user picks a real password; generate hash with the README one-liner — never echo the password into shell history if the user prefers, they can run it themselves).

- [ ] **Step 5: Verify production**

- Open the Vercel URL on desktop: login → profile setup → targets appear.
- On iPhone Safari: login works, weight logging works, layout is usable one-handed.

- [ ] **Step 6: Commit README and tag**

```bash
git add -A && git commit -m "docs: setup and deployment README"
git push
git tag phase-1 && git push --tags
```

---

## Done means

- `npm run test` green; `npm run build` green.
- Live URL, password-protected, working on iPhone and desktop against the same Neon data.
- Profile: edit profile, log weight (updates targets), pin/unpin target overrides — all persisted.
- Tabs for Today/Train/Coach/History present as placeholders for Phases 2–4.
