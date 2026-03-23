# Relentless — First-Pass Schema Plan

**Status:** Draft for review. Do not implement until approved.

**Stack:** Supabase (PostgreSQL + Supabase Auth), Upstash Redis (rate limiting)

This document captures the minimal first-pass schema derived from the PRD.
It does not define final product behavior, scoring formulas, pricing, or UX.

---

## Entity overview

### Infrastructure entities (Phase 1a)

| Entity | Purpose | RLS |
|---|---|---|
| `profiles` | User identity and app state, linked to `auth.users` | Own-row read/write |
| `entitlements` | Current subscription/access state per user | Own-row read; service-role write |
| `entitlement_events` | Append-only log of access state changes | Own-row read; service-role write |
| `idempotency_keys` | Replay safety for protected mutations | Service-role only |
| `audit_log` | Server-side state change history | Service-role only |
| `feature_flags` | Environment/rollout configuration | Authenticated read; service-role write |

### Product-direction entities (Phase 1b)

| Entity | Purpose | RLS |
|---|---|---|
| `coaches` | Content partner metadata | Authenticated read; service-role write |
| `lessons` | Structured lesson content objects | Authenticated read; service-role write |
| `lesson_categories` | Many-to-many: lessons to 4 C's | Authenticated read; service-role write |
| `user_lesson_completions` | Per-user lesson completion records | Own-row read; service-role write |
| `user_progress` | Per-user progress across the 4 C's | Own-row read; service-role write |
| `user_streaks` | Per-user streak state | Own-row read; service-role write |
| `journal_entries` | Per-user reflection entries | Own-row CRUD |

### Deferred entities

| Entity | Trigger | Phase |
|---|---|---|
| `billing_events` | When Apple webhook billing is wired | 3 |
| `usage_ledger` | If metered/quota behavior is added | 3+ |

Rate-limiting state lives in Upstash Redis, not PostgreSQL.

---

## Column-level sketch

### `profiles`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, references `auth.users(id)` on delete cascade | Supabase Auth provides the user ID |
| `display_name` | `text` | nullable | |
| `sport` | `text` | not null, default `'track'` | V1 is track-only |
| `competition_date` | `date` | nullable | Optional, captured in onboarding |
| `onboarding_completed` | `boolean` | not null, default `false` | |
| `created_at` | `timestamptz` | not null, default `now()` | |
| `updated_at` | `timestamptz` | not null, default `now()` | |

### `entitlements`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `user_id` | `uuid` | not null, unique, references `profiles(id)` on delete cascade | One row per user |
| `status` | `text` | not null, default `'none'` | Values TBD (likely: `none`, `trial`, `active`, `expired`) |
| `product_id` | `text` | nullable | StoreKit product identifier |
| `starts_at` | `timestamptz` | nullable | |
| `expires_at` | `timestamptz` | nullable | |
| `created_at` | `timestamptz` | not null, default `now()` | |
| `updated_at` | `timestamptz` | not null, default `now()` | |

### `entitlement_events`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `user_id` | `uuid` | not null, references `profiles(id)` on delete cascade | |
| `event_type` | `text` | not null | e.g. `granted`, `renewed`, `expired`, `revoked`, `restored` |
| `product_id` | `text` | nullable | |
| `metadata` | `jsonb` | nullable | Provider-specific details |
| `created_at` | `timestamptz` | not null, default `now()` | Append-only |

### `idempotency_keys`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `key` | `text` | PK | Client-supplied idempotency key |
| `user_id` | `uuid` | not null, references `profiles(id)` on delete cascade | |
| `response_status` | `integer` | not null | Cached response HTTP status |
| `response_body` | `jsonb` | nullable | Cached response body |
| `created_at` | `timestamptz` | not null, default `now()` | |
| `expires_at` | `timestamptz` | not null | TTL for scheduled cleanup |

### `audit_log`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `actor_id` | `uuid` | nullable | User or system actor |
| `action` | `text` | not null | Stable action identifier |
| `entity_type` | `text` | nullable | e.g. `entitlement`, `profile`, `lesson` |
| `entity_id` | `uuid` | nullable | |
| `metadata` | `jsonb` | nullable | |
| `request_id` | `text` | nullable | For request tracing |
| `created_at` | `timestamptz` | not null, default `now()` | Append-only |

### `feature_flags`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `key` | `text` | not null, unique | Flag identifier |
| `enabled` | `boolean` | not null, default `false` | |
| `metadata` | `jsonb` | nullable | Targeting rules, rollout percentage, etc. |
| `created_at` | `timestamptz` | not null, default `now()` | |
| `updated_at` | `timestamptz` | not null, default `now()` | |

### `coaches`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `name` | `text` | not null | |
| `sport` | `text` | not null, default `'track'` | |
| `bio` | `text` | nullable | |
| `external_url` | `text` | nullable | Subtle outbound CTA link |
| `avatar_url` | `text` | nullable | |
| `created_at` | `timestamptz` | not null, default `now()` | |
| `updated_at` | `timestamptz` | not null, default `now()` | |

### `lessons`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `coach_id` | `uuid` | not null, references `coaches(id)` | |
| `title` | `text` | not null | |
| `duration_seconds` | `integer` | not null | |
| `lesson_type` | `text` | not null, default `'standard'` | Flexible; subtypes TBD |
| `voiceover_url` | `text` | nullable | Asset URL or storage path |
| `on_screen_text` | `text` | nullable | Summary/coaching text; may evolve to structured format |
| `reflection_prompt` | `text` | nullable | Optional reflection question |
| `progress_metadata` | `jsonb` | nullable | 4 C contribution weights; formula TBD |
| `sort_order` | `integer` | not null, default `0` | Drives sequential recommended flow |
| `published` | `boolean` | not null, default `false` | Content gating |
| `created_at` | `timestamptz` | not null, default `now()` | |
| `updated_at` | `timestamptz` | not null, default `now()` | |

### `lesson_categories`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `lesson_id` | `uuid` | not null, references `lessons(id)` on delete cascade | |
| `category` | `text` | not null, check in (`control`, `commitment`, `challenge`, `confidence`) | The 4 C's |
| | | PK (`lesson_id`, `category`) | Many-to-many via composite key |

### `user_lesson_completions`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `user_id` | `uuid` | not null, references `profiles(id)` on delete cascade | |
| `lesson_id` | `uuid` | not null, references `lessons(id)` | |
| `completed_at` | `timestamptz` | not null, default `now()` | |

No unique constraint on (`user_id`, `lesson_id`) — allows re-completions.
Whether re-completions count toward progress depends on the formula (TBD).

### `user_progress`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `user_id` | `uuid` | not null, unique, references `profiles(id)` on delete cascade | One row per user |
| `control_score` | `numeric` | not null, default `0` | Update logic TBD |
| `commitment_score` | `numeric` | not null, default `0` | |
| `challenge_score` | `numeric` | not null, default `0` | |
| `confidence_score` | `numeric` | not null, default `0` | |
| `updated_at` | `timestamptz` | not null, default `now()` | |

### `user_streaks`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `user_id` | `uuid` | not null, unique, references `profiles(id)` on delete cascade | One row per user |
| `current_streak` | `integer` | not null, default `0` | |
| `longest_streak` | `integer` | not null, default `0` | |
| `last_activity_date` | `date` | nullable | |
| `updated_at` | `timestamptz` | not null, default `now()` | |

### `journal_entries`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `user_id` | `uuid` | not null, references `profiles(id)` on delete cascade | |
| `lesson_id` | `uuid` | nullable, references `lessons(id)` | Tied to lesson context |
| `competition_date` | `date` | nullable | Tied to competition context |
| `body` | `text` | not null | |
| `created_at` | `timestamptz` | not null, default `now()` | |
| `updated_at` | `timestamptz` | not null, default `now()` | |

---

## RLS policy summary

All tables in the `public` schema have RLS enabled.

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | own row | auto via trigger | own row | — |
| `entitlements` | own row | service role | service role | service role |
| `entitlement_events` | own row | service role | — | — |
| `idempotency_keys` | — | service role | service role | service role |
| `audit_log` | — | service role | — | — |
| `feature_flags` | authenticated | service role | service role | service role |
| `coaches` | authenticated | service role | service role | service role |
| `lessons` | authenticated | service role | service role | service role |
| `lesson_categories` | authenticated | service role | service role | service role |
| `user_lesson_completions` | own rows | service role | — | — |
| `user_progress` | own row | service role | service role | — |
| `user_streaks` | own row | service role | service role | — |
| `journal_entries` | own rows | own row | own row | own row |

**Terminology:**
- "Service role" = writes go through Supabase Edge Functions using the service-role key, never directly from the client.
- "Own row" = `auth.uid() = user_id`.
- "Authenticated" = any logged-in user.

**Design rationale:**
- `user_lesson_completions`, `user_progress`, and `user_streaks` are service-role write because they affect protected progress state (PRD: server is source of truth for protected state).
- `journal_entries` allows direct client CRUD since the journal is lightweight personal data without protected-state implications. Can be tightened later if needed.
- Content tables (`coaches`, `lessons`, `lesson_categories`) are readable by any authenticated user but writable only via service role (admin/content management).

---

## Key indexes (beyond PKs and unique constraints)

| Table | Index | Purpose |
|---|---|---|
| `entitlements` | `user_id` (unique, already) | Lookup by user |
| `entitlement_events` | (`user_id`, `created_at`) | Event history queries |
| `audit_log` | (`actor_id`, `created_at`) | Actor history |
| `audit_log` | (`entity_type`, `entity_id`) | Entity history |
| `lessons` | (`coach_id`, `sort_order`) | Ordered lesson listing |
| `lessons` | (`published`, `sort_order`) | Published lesson feed |
| `user_lesson_completions` | (`user_id`, `lesson_id`) | Completion lookups |
| `user_lesson_completions` | (`user_id`, `completed_at`) | Streak / history queries |
| `journal_entries` | (`user_id`, `created_at`) | Chronological listing |
| `idempotency_keys` | (`expires_at`) | Scheduled cleanup |

---

## Open questions for future passes

1. **Re-completion semantics.** Should completing a lesson again contribute to progress? Current schema allows multiple completion rows per (`user_id`, `lesson_id`). Depends on scoring formula (TBD).

2. **Synchronized on-screen text.** The schema uses `text` for `on_screen_text`. If timed text segments synced to voiceover are needed, this may evolve to `jsonb` with a structured array. Deferred.

3. **Profile auto-creation.** Supabase can auto-create a `profiles` row via a database trigger on `auth.users` insert. Implementation detail for the migration pass.

4. **Idempotency key cleanup.** Expired rows need scheduled cleanup (pg_cron or equivalent). Implementation detail.

5. **Audit log growth.** If `audit_log` grows large, time-based partitioning may be needed. Deferred to operational maturity.

6. **Lesson content delivery.** How voiceover assets are stored/served (Supabase Storage, CDN, bundled) is not specified in the PRD. Does not affect the schema but affects `voiceover_url` semantics.

---

## Remaining Human Input Needed

These items from the PRD remain TBD and must not be guessed:

| # | Item | Blocks |
|---|---|---|
| 1 | Free-trial duration | `entitlements` status machine |
| 2 | Subscription offerings (periods, naming) | `entitlements`, `product_id` values |
| 3 | Progress scoring formula | `user_progress` update logic |
| 4 | Streak reset rule | `user_streaks` update logic |
| 5 | Onboarding screen sequence | Profile fields captured at onboarding |
| 6 | Lesson interaction subtypes | `lessons.lesson_type` enum values |
| 7 | Exact post-expiration UX | Client-side gating behavior |
| 8 | Exact protected endpoint list | Entitlement check middleware scope |

---

## Implementation plan

When this schema plan is approved, implementation proceeds in two migrations:

### Migration 1 — Infrastructure tables (Phase 1a)

- `profiles` (with `auth.users` trigger for auto-creation)
- `entitlements`
- `entitlement_events`
- `idempotency_keys`
- `audit_log`
- `feature_flags`
- All RLS policies for these tables
- Key indexes

### Migration 2 — Product-direction tables (Phase 1b)

- `coaches`
- `lessons`
- `lesson_categories`
- `user_lesson_completions`
- `user_progress`
- `user_streaks`
- `journal_entries`
- All RLS policies for these tables
- Key indexes
- Seed data: one coach record for V1 partner (name TBD)

### Not included in first pass

- `billing_events` (Phase 3, when Apple webhook billing is wired)
- `usage_ledger` (if metered/quota behavior is added later)
- Edge Functions / API endpoints
- Client-side code
- Scoring / streak logic
- Onboarding UI
- Paywall integration
