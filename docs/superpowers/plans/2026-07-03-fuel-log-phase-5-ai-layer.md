# Fuel Log Phase 5: AI Layer Activation (Free-Text Food Parsing + Review Narrative) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn on the dormant AI layer (design spec section 7) for two features: free-text food logging on the Today tab ("chicken rice with drumstick, kopi o kosong" → parsed diary entries) and a short AI-written narrative on top of the already-working rule-based weekly review. Both are gated on the presence of `ANTHROPIC_API_KEY` — absent, the app behaves exactly as it does today; present, these two features light up with no other code changes needed.

**Architecture:** A single new `src/lib/ai.ts` module is the only place that talks to the Anthropic API. `isAIEnabled()` is the one gate everything else checks. Two new thin API routes (`GET /api/config`, `POST /api/ai/parse-food`) plus one existing route extended (`POST /api/reviews` now also generates a narrative when AI is enabled). No AI call is ever made from the client directly — the API key never leaves the server.

**Tech Stack:** Adds `@anthropic-ai/sdk` as a new dependency. Everything else is the existing stack (Next.js, TypeScript, Tailwind, Drizzle, zod, Vitest).

**Spec:** `docs/superpowers/specs/2026-07-02-fuel-log-app-design.md`, section 7 (AI layer) and the free-text food box mentioned in section 4.1. This is Phase 5, building on the fully-deployed Phases 1-4. Chat coach (also part of section 7) is explicitly deferred — confirmed with the user as out of scope for this phase.

**Scope decisions (confirmed with user before writing this plan):**
1. Building only `parseFood` (free-text food logging) and `reviewNarrative` (weekly review summary) — `coachChat` is deferred to a future phase.
2. Model: `claude-haiku-4-5-20251001` for both features — cheap enough that cost is a non-factor at personal usage volume, and both tasks (structured macro estimation, a short summary of numbers already computed) are well within a fast model's ability.
3. **AI output is never auto-saved.** `parseFood` returns candidate items for the user to review and individually confirm (tap to log), exactly like a search result — never silently writes to the diary. This matches the existing manual-entry flow's trust model and avoids silently logging a wrong AI guess.
4. `parseFood`/`reviewNarrative` are not unit-tested (they require a real network call to Anthropic; mocking the SDK realistically would be significant effort for uncertain value at this app's scale). `isAIEnabled()` and structural code (route wiring, UI gating) are unit-tested; the AI calls themselves are verified manually against the real API in the last task.

## Global Constraints

- TypeScript strict mode; no `any` in committed code.
- Single-user app: no `user_id` columns anywhere.
- The `ANTHROPIC_API_KEY` env var is read only inside `src/lib/ai.ts` — no other file touches `process.env.ANTHROPIC_API_KEY` directly.
- Every AI call is wrapped in a try/catch at its call site (API route) — a failed/slow AI call must degrade gracefully (empty parse result, or a `null` narrative on the review), never crash the request or block the deterministic functionality that already works without AI.
- Dark theme only. Follow existing Tailwind patterns from `src/components/today/*.tsx` and `src/components/coach/*.tsx`.
- Run `npm run test` before every commit; run `npm run build` before any task that touches routes/pages.
- Working directory for all commands: `/Users/darryltan/Calorie App`.

---

### Task 1: `lib/ai.ts` core — `isAIEnabled` and the Anthropic client, plus `/api/config`

**Files:**
- Create: `src/lib/ai.ts`, `src/app/api/config/route.ts`
- Test: `tests/ai.test.ts`
- Modify: `package.json` (add `@anthropic-ai/sdk`)

**Interfaces:**
- Produces:
  - `isAIEnabled(): boolean` — `true` iff `process.env.ANTHROPIC_API_KEY` is set and non-empty.
  - `getAnthropicClient(): Anthropic` — lazily constructs an `Anthropic` client from `@anthropic-ai/sdk` using the env var. Throws if called when `!isAIEnabled()` (callers must check `isAIEnabled()` first — this is a programmer-error guard, not a user-facing error path).
  - `GET /api/config` → `{ aiEnabled: boolean }` — the only way the client learns whether to render AI affordances.

- [ ] **Step 1: Install the SDK**

```bash
npm install @anthropic-ai/sdk
```

- [ ] **Step 2: Write the failing test**

Create `tests/ai.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isAIEnabled, getAnthropicClient } from '@/lib/ai';

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

describe('isAIEnabled', () => {
  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  });

  it('returns false when the env var is unset or empty', () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(isAIEnabled()).toBe(false);
    process.env.ANTHROPIC_API_KEY = '';
    expect(isAIEnabled()).toBe(false);
  });

  it('returns true when the env var is set to a non-empty value', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
    expect(isAIEnabled()).toBe(true);
  });
});

describe('getAnthropicClient', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
  });
  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  });

  it('constructs a client when AI is enabled', () => {
    expect(() => getAnthropicClient()).not.toThrow();
  });

  it('throws if called when AI is disabled', () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => getAnthropicClient()).toThrow();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm run test`
Expected: FAIL — cannot resolve `@/lib/ai`.

- [ ] **Step 4: Implement**

Create `src/lib/ai.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk';

export const AI_MODEL = 'claude-haiku-4-5-20251001';

export function isAIEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export function getAnthropicClient(): Anthropic {
  if (!isAIEnabled()) {
    throw new Error('getAnthropicClient called while AI is disabled — check isAIEnabled() first');
  }
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm run test`
Expected: all pass.

- [ ] **Step 6: Implement `/api/config`**

Create `src/app/api/config/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { isAIEnabled } from '@/lib/ai';

export async function GET() {
  return NextResponse.json({ aiEnabled: isAIEnabled() });
}
```

- [ ] **Step 7: Verify build**

Run: `npm run build` → succeeds, lists `/api/config`.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: AI layer gate (isAIEnabled) and /api/config route"
```

---

### Task 2: `parseFood` and `POST /api/ai/parse-food`

**Files:**
- Modify: `src/lib/ai.ts`
- Create: `src/app/api/ai/parse-food/route.ts`
- Modify: `src/lib/validate.ts`
- Test: `tests/validate-ai.test.ts`

**Interfaces:**
- Consumes: `AI_MODEL`, `isAIEnabled`, `getAnthropicClient` from `@/lib/ai` (Task 1).
- Produces:
  - `interface ParsedFoodItem { name: string; portionLabel: string; calories: number; protein: number; carbs: number; fat: number }` (appended to `@/lib/ai`)
  - `parseFood(text: string): Promise<ParsedFoodItem[]>` — sends the free-text description to Claude with a forced tool call so the response is structured JSON, not free text to parse ourselves. Returns `[]` if the model's response doesn't include the expected tool call (defensive — should not happen with `tool_choice` forced, but never throw a shape error up to the route).
  - `ParseFoodBody` (in `@/lib/validate`) — `{ text: string (1-2000 chars) }`.
  - `POST /api/ai/parse-food` → 503 `{ error: 'AI is not enabled' }` if `!isAIEnabled()`; 400 on invalid body; 200 `{ items: ParsedFoodItem[] }` on success; 502 `{ error: 'AI request failed' }` if the Anthropic call throws (network/API error) — the route must catch this, not let it 500.

- [ ] **Step 1: Write the failing validation test**

Create `tests/validate-ai.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ParseFoodBody } from '@/lib/validate';

describe('ParseFoodBody', () => {
  it('accepts a reasonable description and rejects empty/oversized text', () => {
    expect(ParseFoodBody.safeParse({ text: 'chicken rice with drumstick, kopi o kosong' }).success).toBe(true);
    expect(ParseFoodBody.safeParse({ text: '' }).success).toBe(false);
    expect(ParseFoodBody.safeParse({ text: 'a'.repeat(2001) }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails, then implement the schema**

Run: `npm run test` → FAIL (cannot resolve `ParseFoodBody`).

Append to `src/lib/validate.ts`:

```ts
export const ParseFoodBody = z.object({
  text: z.string().min(1).max(2000),
});
```

Run: `npm run test` → passes.

- [ ] **Step 3: Implement `parseFood`**

**Before writing this code**, check the actual type names exported by the installed `@anthropic-ai/sdk` version — run `cat node_modules/@anthropic-ai/sdk/package.json | grep version` to see which version installed, then check `node_modules/@anthropic-ai/sdk/resources/messages*.d.ts` (or your editor's autocomplete on `Anthropic.Messages`) for the actual names of the tool-definition type and the tool-use/text content-block types. The code below assumes `Anthropic.Tool`, `Anthropic.Messages.ToolUseBlock`, and `Anthropic.Messages.TextBlock` — these are a reasonable guess at the SDK's typical namespacing but may not be exactly right for the installed version. If the exact names differ, use the real ones; the runtime behavior (call `messages.create` with a forced tool, read the `tool_use` content block) is what matters, not these specific type names.

Append to `src/lib/ai.ts`:

```ts
export interface ParsedFoodItem {
  name: string;
  portionLabel: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

const PARSE_FOOD_TOOL: Anthropic.Tool = {
  name: 'log_food_items',
  description: 'A structured list of food items parsed from a free-text meal description, with estimated nutrition.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            portionLabel: { type: 'string' },
            calories: { type: 'number' },
            protein: { type: 'number' },
            carbs: { type: 'number' },
            fat: { type: 'number' },
          },
          required: ['name', 'portionLabel', 'calories', 'protein', 'carbs', 'fat'],
        },
      },
    },
    required: ['items'],
  },
};

export async function parseFood(text: string): Promise<ParsedFoodItem[]> {
  const client = getAnthropicClient();
  const message = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 1024,
    tools: [PARSE_FOOD_TOOL],
    tool_choice: { type: 'tool', name: 'log_food_items' },
    messages: [{
      role: 'user',
      content: `Parse this meal description into individual food items with estimated nutrition (calories, protein in grams, carbs in grams, fat in grams). Use realistic portion sizes. Prefer Singaporean/hawker food knowledge when the description sounds local. Description: "${text}"`,
    }],
  });

  const toolUse = message.content.find(
    (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use',
  );
  if (!toolUse) return [];

  const input = toolUse.input as { items?: ParsedFoodItem[] };
  return input.items ?? [];
}
```

- [ ] **Step 4: Implement the route**

Create `src/app/api/ai/parse-food/route.ts`:

```ts
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
```

- [ ] **Step 5: Run tests and build**

Run: `npm run test` → all pass. Run: `npm run build` → succeeds, lists `/api/ai/parse-food`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: parseFood AI function and /api/ai/parse-food route"
```

---

### Task 3: Today tab UI — free-text AI food logging

**Files:**
- Modify: `src/components/today/FoodLogger.tsx`

**Interfaces:**
- Consumes: `GET /api/config`, `POST /api/ai/parse-food`, existing `POST /api/food-items` and `POST /api/diary` (Phase 2) for confirming a parsed item.
- Produces: `FoodLogger` fetches `/api/config` once on mount; when `aiEnabled`, renders a textarea + "Parse with AI" button above the manual-entry link. Parsing shows each returned item as a row with a "Log" button (mirrors the existing manual-entry flow: create a food item via `POST /api/food-items`, then log it via `POST /api/diary` with that item's id and multiplier 1) — never auto-logs.

- [ ] **Step 1: Add AI state and the config check**

Read the current `src/components/today/FoodLogger.tsx` first. Add state near the top of the component:

```ts
const [aiEnabled, setAiEnabled] = useState(false);
const [aiText, setAiText] = useState('');
const [aiItems, setAiItems] = useState<{ name: string; portionLabel: string; calories: number; protein: number; carbs: number; fat: number }[]>([]);
const [aiLoading, setAiLoading] = useState(false);
const [aiError, setAiError] = useState('');
```

Add a mount effect (place it alongside the existing recents/favourites `useEffect`, don't merge the two — they fetch different things):

```ts
useEffect(() => {
  fetch('/api/config').then((r) => r.json()).then((c) => setAiEnabled(!!c.aiEnabled));
}, []);
```

- [ ] **Step 2: Add the parse and log-item handlers**

Add these functions inside the component, near `logManual`:

```ts
async function parseWithAI() {
  if (!aiText.trim()) return;
  setAiLoading(true);
  setAiError('');
  const res = await fetch('/api/ai/parse-food', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: aiText }),
  });
  if (res.ok) {
    const data = await res.json();
    setAiItems(data.items);
  } else {
    setAiError('Could not parse that — try rephrasing or log manually.');
  }
  setAiLoading(false);
}

async function logAiItem(item: { name: string; portionLabel: string; calories: number; protein: number; carbs: number; fat: number }) {
  const created = await fetch('/api/food-items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: item.name, portionLabel: item.portionLabel,
      kcal: item.calories, protein: item.protein, carbs: item.carbs, fat: item.fat,
    }),
  }).then((r) => r.json());

  const res = await fetch('/api/diary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      date: todayLocalISO(), mealSlot, foodItemId: created.item.id, name: created.item.name,
      portionMultiplier: 1, calories: item.calories, protein: item.protein, carbs: item.carbs, fat: item.fat,
    }),
  });
  if (res.ok) {
    setAiItems((prev) => prev.filter((i) => i !== item));
    await onLogged();
  }
}
```

- [ ] **Step 3: Render the AI section**

Add this block in the JSX, directly above the existing `{showManual && (...)}` block (same visual tier as the manual-entry fallback):

```tsx
{aiEnabled && (
  <div className="mt-3 rounded-lg bg-gray-800 p-3">
    <div className="mb-2 text-[11px] uppercase tracking-wider text-gray-500">Or describe what you ate</div>
    <textarea
      value={aiText}
      onChange={(e) => setAiText(e.target.value)}
      placeholder="e.g. chicken rice with drumstick, kopi o kosong"
      rows={2}
      className={`${inputCls} resize-none`}
    />
    <button
      onClick={parseWithAI}
      disabled={aiLoading || !aiText.trim()}
      className="mt-2 w-full rounded-lg bg-blue-700 py-2 text-sm font-semibold text-white disabled:opacity-50"
    >
      {aiLoading ? 'Parsing…' : 'Parse with AI'}
    </button>
    {aiError && <p className="mt-2 text-xs text-red-400">{aiError}</p>}
    {aiItems.length > 0 && (
      <div className="mt-3 space-y-1.5">
        {aiItems.map((item, i) => (
          <div key={i} className="flex items-center justify-between rounded-lg bg-gray-900 px-3 py-2">
            <div>
              <div className="text-sm text-gray-200">{item.name}</div>
              <div className="text-[11px] text-gray-500">{item.portionLabel} · {Math.round(item.calories)} kcal</div>
            </div>
            <button
              onClick={() => logAiItem(item)}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white"
            >
              Log
            </button>
          </div>
        ))}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 4: Verify**

Run: `npm run test` → all pass (no new tests expected for this UI task; existing suite must stay green). Run: `npm run build` → succeeds.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: free-text AI food logging on the Today tab"
```

---

### Task 4: `reviewNarrative`, `weekly_reviews.narrative` column, and wiring into review generation

**Files:**
- Modify: `src/lib/ai.ts`, `src/db/schema.ts`, `src/db/queries.ts`, `src/app/api/reviews/route.ts`
- Create migration via `npm run db:generate`

**Interfaces:**
- Consumes: `AI_MODEL`, `isAIEnabled`, `getAnthropicClient` from `@/lib/ai`.
- Produces:
  - `reviewNarrative(input: { weekStart: string; weightTrendPercent: number | null; calorieAdherencePercent: number; proteinAdherencePercent: number; workoutsCompleted: number; workoutsPlanned: number; recommendationMessage: string }): Promise<string>` (appended to `@/lib/ai`) — returns a short (2-3 sentence) text summary. Returns `''` if the model returns no text block (defensive fallback).
  - `weeklyReviews.narrative`: new nullable `text` column.
  - `WeeklyReview` interface (in `@/db/queries`) gains `narrative: string | null`.
  - `createWeeklyReview`'s input type gains `narrative: string | null` (required field on the input — callers must explicitly pass `null` when not generating one, so it's never accidentally omitted).
  - `POST /api/reviews`: after computing the rule-based review, if `isAIEnabled()`, calls `reviewNarrative(...)` in a try/catch (defaulting to `null` on failure) before persisting.

- [ ] **Step 1: Add the schema column**

Read `src/db/schema.ts`'s current `weeklyReviews` definition first. Add one line to it:

```ts
narrative: text('narrative'),
```

(Insert it near the other review fields, e.g. right after `recommendation: jsonb('recommendation').notNull(),` — exact position doesn't matter, just keep it inside the `weeklyReviews` table definition.)

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: a new `drizzle/000X_*.sql` with an `ALTER TABLE "weekly_reviews" ADD COLUMN "narrative" text;` statement (nullable, no default needed).

- [ ] **Step 3: Run existing tests**

Run: `npm run test`
Expected: existing `tests/queries-review.test.ts` tests that call `createWeeklyReview` will now FAIL to type-check / fail at the call site once `narrative` becomes required on the input — this is expected. Update those call sites (see Step 5) before re-running.

- [ ] **Step 4: Implement `reviewNarrative`**

Uses the same `Anthropic.Messages.TextBlock` type-name assumption flagged in Task 2 — verify against the installed SDK version the same way if it doesn't compile.

Append to `src/lib/ai.ts`:

```ts
export async function reviewNarrative(input: {
  weekStart: string;
  weightTrendPercent: number | null;
  calorieAdherencePercent: number;
  proteinAdherencePercent: number;
  workoutsCompleted: number;
  workoutsPlanned: number;
  recommendationMessage: string;
}): Promise<string> {
  const client = getAnthropicClient();
  const message = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `Write a short (2-3 sentence), specific, honest coach-style summary of this past week for a calorie-tracking app user. No generic filler, no greeting. Data: weight trend ${input.weightTrendPercent === null ? 'no data' : `${input.weightTrendPercent.toFixed(2)}%/week`}, calorie adherence ${input.calorieAdherencePercent}%, protein adherence ${input.proteinAdherencePercent}%, workouts ${input.workoutsCompleted}/${input.workoutsPlanned}, current rule-based recommendation: "${input.recommendationMessage}".`,
    }],
  });

  const textBlock = message.content.find(
    (block): block is Anthropic.Messages.TextBlock => block.type === 'text',
  );
  return textBlock?.text ?? '';
}
```

- [ ] **Step 5: Update `createWeeklyReview` and `WeeklyReview` in queries.ts**

In `src/db/queries.ts`, update the `WeeklyReview` interface to add `narrative: string | null;` as a field. `createWeeklyReview`'s input type is `Omit<WeeklyReview, 'id' | 'applied'>`, so it automatically requires `narrative` once the interface changes — no signature edit needed there, just confirm `toWeeklyReview` (the row-to-interface mapper) doesn't need changes since `narrative` passes through as a plain column already matching the interface's field name.

Update the two existing test files that call `createWeeklyReview` (`tests/queries-review.test.ts`) to pass `narrative: null` in every `createWeeklyReview` call — add `narrative: null,` to each call's input object.

- [ ] **Step 6: Run tests to confirm the fix**

Run: `npm run test`
Expected: all pass.

- [ ] **Step 7: Wire narrative generation into `POST /api/reviews`**

Edit `src/app/api/reviews/route.ts`. Add the import: `import { isAIEnabled, reviewNarrative } from '@/lib/ai';`. Just before the `createWeeklyReview(db, {...})` call, add:

```ts
let narrative: string | null = null;
if (isAIEnabled()) {
  try {
    narrative = await reviewNarrative({
      weekStart,
      weightTrendPercent: result.weightTrendPercent,
      calorieAdherencePercent: result.calorieAdherencePercent,
      proteinAdherencePercent: result.proteinAdherencePercent,
      workoutsCompleted: sessions.length,
      workoutsPlanned: activeRoutine?.daysPerWeek ?? 0,
      recommendationMessage: result.recommendation.message,
    });
  } catch {
    narrative = null;
  }
}
```

Then add `narrative,` to the `createWeeklyReview(db, { ... })` call's input object.

- [ ] **Step 8: Run tests and build**

Run: `npm run test` → all pass. Run: `npm run build` → succeeds.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: AI review narrative, weekly_reviews.narrative column, and review-route wiring"
```

---

### Task 5: Coach page UI — display the narrative

**Files:**
- Modify: `src/components/coach/WeeklyReviewCard.tsx`

**Interfaces:**
- Consumes: `WeeklyReview.narrative` (Task 4).
- Produces: when `review.narrative` is a non-empty string, renders it as a styled callout between the stats grid and the rule-based recommendation box; renders nothing extra when `null`/empty (AI disabled or the call failed) — the existing rule-based UI is completely unaffected.

- [ ] **Step 1: Add the narrative block**

Read the current `src/components/coach/WeeklyReviewCard.tsx` first. Insert this block between the stats `<div className="mb-4 grid grid-cols-2 gap-3">...</div>` and the recommendation `<div className={...RECOMMENDATION_COLOR...}>`:

```tsx
{review.narrative && (
  <div className="mb-3 rounded-lg border border-blue-900/60 bg-blue-950/30 p-3 text-sm italic text-gray-300">
    {review.narrative}
  </div>
)}
```

- [ ] **Step 2: Verify**

Run: `npm run test` → all pass. Run: `npm run build` → succeeds.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: display AI review narrative on the coach page"
```

---

### Task 6: End-to-end verification with a real API key and deploy

**Files:** none created — verification task. Requires a real `ANTHROPIC_API_KEY` in `.env.local` (the user adds this directly, not via a command you run, since it's a secret you shouldn't need to see).

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Confirm the key is present**

Ask the user to confirm `ANTHROPIC_API_KEY=sk-ant-...` is already saved in `.env.local` before starting this task. Do not proceed to live-call steps without it — if absent, stop and ask rather than guessing at a placeholder key (which would just produce 401s and waste a review cycle).

- [ ] **Step 2: Migrate**

```bash
cd "/Users/darryltan/Calorie App"
set -a && source .env.local && set +a
npm run db:migrate
```

Expected: applies the `narrative` column migration.

- [ ] **Step 3: Verify `/api/config` reflects the key**

Start `npm run dev`, log in, then:

```bash
curl -s -b <cookie-jar> http://localhost:3000/api/config
```

Expected: `{"aiEnabled":true}`.

- [ ] **Step 4: Verify `parseFood` against the real API**

```bash
curl -s -b <cookie-jar> -X POST http://localhost:3000/api/ai/parse-food \
  -H 'Content-Type: application/json' \
  -d '{"text":"chicken rice with drumstick, kopi o kosong"}'
```

Expected: `{"items":[...]}` with at least one item resembling chicken rice and one resembling kopi o kosong, with plausible calorie/macro estimates (chicken rice with drumstick should land somewhere in the 500-800 kcal range; kopi o kosong should be near-zero calories). If the response is empty or wildly implausible, inspect the actual model output (add a temporary `console.error` around the `parseFood` call, or check the Anthropic Console's request logs) before assuming the route is broken — this is the one place in the app where output isn't deterministic, so a single odd-looking estimate isn't necessarily a bug, but a systematically broken/empty response is.

- [ ] **Step 5: Verify `reviewNarrative` against the real API**

```bash
curl -s -b <cookie-jar> -X POST http://localhost:3000/api/reviews \
  -H 'Content-Type: application/json' \
  -d '{"today":"<today>"}'
```

Expected: the response's `review` no longer needs a `narrative` field check via a separate call — confirm the JSON response includes a non-null `narrative` string (a real sentence, not a template artifact).

- [ ] **Step 6: Browser walkthrough**

On the Today tab: type a free-text description, tap "Parse with AI", confirm items appear, tap "Log" on one, confirm it appears in the entry list and the summary totals update (same as any other logged item). On the Coach tab: generate a review, confirm the italicized AI narrative appears above the rule-based recommendation box.

- [ ] **Step 7: Fix anything found, run full suite, commit if changed**

```bash
npm run test && npm run build
```

Only commit if fixes were made:

```bash
git add -A && git commit -m "test: verified end-to-end AI food parsing and review narrative against real Anthropic API"
```

- [ ] **Step 8: Add the key to Vercel and deploy**

Confirm with the user before touching Vercel project settings. Then:

```bash
npx vercel env add ANTHROPIC_API_KEY production
```

(This prompts for the value interactively — the user should paste it directly into the terminal prompt, not hand it to you to type.)

```bash
git push origin main
npx vercel --prod --yes
```

Re-run the curl checks from Steps 3-5 against the production URL. Watch for the same class of "build succeeded but routes 404" failure mode seen in Phase 1 — if it recurs, check `npx vercel project inspect calorie-tracker` for `Framework Preset`.

---

## Done means

- `npm run test` green; `npm run build` green.
- With `ANTHROPIC_API_KEY` set: Today tab's free-text box parses real meal descriptions into loggable candidate items; Coach tab's weekly review includes a short AI-written narrative.
- With `ANTHROPIC_API_KEY` unset: the app behaves exactly as it did at the end of Phase 4 — no AI UI renders, no code path attempts a network call.
- The key lives only in `.env.local` (dev) and Vercel's production environment variables — never committed, never passed through the client.
