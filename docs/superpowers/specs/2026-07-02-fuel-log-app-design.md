# Fuel Log — Full App Design

**Date:** 2026-07-02
**Status:** Approved
**Origin:** Evolution of a single-file React prototype (`calorie_tracker.jsx`) built in a Claude artifact — AI food logging, coach chat, history, and profile with goal-based targets.

## 1. Summary

A single-user, mobile-first calorie tracking and training coach web app. It replaces the prototype's sandbox-only AI calls with a fully functional AI-free core (curated food database, template-based routine generation, formula-based weekly reviews), with an AI layer designed in but dormant until an Anthropic API key is provided. Data syncs across the user's iPhone and desktop through a hosted backend.

## 2. Goals & non-goals

**Goals**

- Log food, water, workouts, and body weight from phone or desktop against one shared dataset.
- Built-in training coach: generate a gym routine, log workouts against it, and get weekly progress reviews with concrete target adjustments.
- Profile page to update progress and adjust calorie/macro targets, including manual overrides on top of calculated targets.
- $0/month to run at launch (free hosting tiers, no AI usage).
- AI features (free-text/photo food parsing, chat coach, review narratives) activate by setting one environment variable — no rework.

**Non-goals**

- Multi-user support, sign-up flows, or public launch readiness.
- Native iOS/Android apps, push notifications, HealthKit.
- Offline-first sync (standard online web app; optimistic UI only).
- Micronutrient tracking (macros + calories + water only).

## 3. Architecture

- **Framework:** Next.js (App Router) — one codebase for UI and API routes.
- **Hosting:** Vercel free tier (HTTPS, push-to-deploy from GitHub).
- **Database:** Neon free-tier Postgres, accessed via Drizzle ORM.
- **Auth:** single password, hash stored in a Vercel env var (`AUTH_PASSWORD_HASH`); successful login sets a 30-day encrypted session cookie (iron-session). All API routes require the session. Password change = update env var.
- **PWA:** web app manifest + icons for "Add to Home Screen" on iPhone; responsive layout (bottom tab bar on mobile, sidebar on desktop).
- **AI:** a single server-side module gates all AI functionality on the presence of `ANTHROPIC_API_KEY`. Absent → AI UI does not render; present → AI features appear. Client discovers availability via a config endpoint.

## 4. Pages

Bottom tab bar (mobile) / sidebar (desktop), dark theme carried over from the prototype.

### 4.1 Today

- Calorie summary (eaten / remaining / target) + protein, carbs, fat progress bars; water tracker (+/− 0.25 L); gym/rest day toggle. Toggle auto-sets to "gym" when a workout is logged that day.
- **Food logging (AI-free core):**
  - Search-as-you-type over the food database with portion picker.
  - "Recents & favourites" row for one-tap repeat logging.
  - Manual entry form (name + macros) as fallback; saved manual entries become custom food items.
- Entries listed by meal slot (breakfast/lunch/dinner/snacks) with edit/delete.
- **When AI enabled:** free-text box ("chicken rice with drumstick, kopi o kosong") parsed server-side into diary entries, same as the prototype.

### 4.2 Train

- Today's planned workout from the active routine as a checklist: per exercise, log sets × reps × weight with previous session's numbers pre-filled and progression already applied.
- Full weekly routine view.
- "Rebuild routine" flow: goal + days/week + experience → template-generated plan (2–3 days: full body; 4: upper/lower; 5–6: push/pull/legs).
- Logging a session marks the day as a gym day.

### 4.3 Coach

- **Weekly review** (generated Mondays or on demand): 7-day rolling weight trend chart, calorie & protein adherence %, workouts completed vs planned, and a rule-based recommendation. "Apply" button writes the recommended target change.
- **When AI enabled:** chat coach (text + food/menu photo upload) with server-injected context: profile, targets, today's intake, routine, recent history.

### 4.4 History

- Reverse-chronological day list: food totals vs targets (adherence badge), workout done, weight entry, water.
- Tap a day to expand full entries.

### 4.5 Profile

- Stats header: current weight, BMI, weight trend, goal.
- Log today's weight (updates profile weight + recalculates targets, as in prototype).
- Edit profile: name, weight, height, age, gender, goal (fat loss / maintain / muscle gain), gym days/week, experience level.
- **Target overrides:** each metric (gym-day calories, rest-day calories, protein, carb range, fat range, water) shows its calculated value and can be pinned to a manual value; pinned values persist through recalculations until unpinned.
- Current targets table (as in prototype), marking which values are overridden.

## 5. Data model

| Table | Purpose | Key fields |
|---|---|---|
| `profile` | Single row | name, weight, height, age, gender, goal, gym_days_per_week, experience |
| `targets` | Active targets + change history | metric values, per-metric `source` (calculated/manual), effective_from |
| `weight_log` | Body weight entries | date, weight_kg |
| `food_items` | Seeded DB (~300 SG/western/gym items) + custom foods | name, portion label, kcal, protein, carbs, fat, is_custom, is_favourite |
| `diary_entries` | Food eaten | date, meal_slot, food_item_id nullable, name, portion multiplier, macros |
| `day_log` | Per-day flags | date, water_l, is_gym_day |
| `routines` | Generated plans (active + archived) | goal, days/week, days[] with exercises, sets, rep ranges, progression scheme |
| `workout_sessions` | Sessions performed | date, routine_day, notes |
| `set_logs` | Sets within a session | exercise, set number, reps, weight_kg |
| `weekly_reviews` | Generated reviews | week, computed metrics, recommendation, applied flag |

Seed food database ships as JSON and is loaded by a seed script; includes hawker dishes (chicken rice, bak chor mee, cai fan components, laksa, mee goreng, kopi/teh variants, etc.) plus common western and gym staples (whey, oats, eggs, rice, chicken breast).

## 6. Coaching logic (deterministic)

All logic is pure functions over the data model — unit-testable, and reused as context for the future AI layer.

- **Target calculation:** prototype formula retained. TDEE ≈ weight × 28.2 (gym day) / × 24.1 (rest day); goal adjustments (−450/−400 cut, +300/+250 bulk); protein 2 g/kg (2.2 bulk); goal-dependent carb/fat ranges; water 2.5 L. Manual overrides applied last.
- **Routine generation:** template library keyed by days/week × experience, exercise selection influenced by goal. Each exercise carries a progression rule (default: double progression — top of rep range on all sets → +2.5 kg next session). Applied when pre-filling the next session.
- **Weekly review engine:** computes 7-day rolling weight trend, calorie adherence %, protein adherence %, training completion. Rules include: cutting with flat weight (≥2 weeks) → recommend −100 to −150 kcal; losing > ~1%/week → recommend +100 kcal; protein missed most days → flag as priority over calorie changes; insufficient data (<10 logged days) → no recommendation, say so. Recommendations require explicit user acceptance; accepting writes a new `targets` row.

## 7. AI layer (dormant at launch)

Server module `lib/ai.ts` exposes `isAIEnabled()` (checks `ANTHROPIC_API_KEY`) and typed functions:

- `parseFood(text|image, context)` → diary entry candidates (Today tab free-text/photo box).
- `coachChat(messages, context)` → chat reply (Coach tab).
- `reviewNarrative(reviewData)` → short narrative on top of the computed weekly review.

Context always assembled from the same tables the deterministic logic uses. API key lives only server-side. UI checks a `/api/config` flag to decide whether to render AI affordances. Model: latest Sonnet-class model at time of enabling.

## 8. Error handling

- Optimistic UI for logging (instant render, background persist, retry toast on failure); failed saves never discard user input.
- API routes validate payloads (zod) and return typed errors.
- Review engine declines to recommend on insufficient data rather than guessing.
- Session-expired responses redirect to login preserving the in-progress page.

## 9. Testing

- **Unit (Vitest):** target calculation across all goals; override pin/unpin behaviour; progression rules; weekly review thresholds and insufficient-data behaviour; food search ranking.
- **Integration:** API route handlers against a test database (auth required, CRUD for diary/workouts/weight, review generation).
- **Manual:** UI flows verified via local preview and on-device (iPhone) before deploy.

## 10. Build order (high level)

1. Scaffold Next.js + Drizzle + auth + deploy pipeline (walking skeleton on Vercel).
2. Profile + targets (calculation, overrides) — unlocks everything else.
3. Food database seed + Today tab logging.
4. Train tab: routine generation + workout logging.
5. Coach tab: weekly review engine.
6. History tab + PWA polish + on-device verification.
7. (Later, user-triggered) AI layer activation.
