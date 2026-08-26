# Program ratings (in-app lesson-pack stars)

Internal tracking only. **Not** the Apple App Store / StoreKit review prompt.

Users rate a lesson pack (1–5 stars) after finishing the last lesson, **before** the existing free-text feedback page. Ratings are never shown back to users in the app.

## Where it is stored

| Piece | Location |
|---|---|
| Table | `public.program_ratings` |
| Migration | `supabase/migrations/20260822000000_program_ratings.sql` |
| Edge function | `POST /program-rating` → `supabase/functions/program-rating/index.ts` |
| UI | `mobile/app/lesson/[id].tsx` — modal over `pack_complete` (feedback), then trophy (`done`), then streak |

Columns: `user_id`, `program_id`, `program_name`, `rating` (1–5), `app_build`, `created_at`. One row per user per program (upsert). RLS on; writes are service-role only via the Edge function.

## When it shows (first time only)

The stars + pack-complete feedback screen fire together, **once per user per pack**, and only when `POST /lessons/:id/complete` returns `pack_completed: true`.

That flag is true only if all of these hold:

1. This is the first completion of the pack’s **final** published lesson (`lesson_completion_count === 1`, not a same-day duplicate).
2. That lesson belongs to the user’s **active** program (Library replay of another pack does not count).
3. The user does **not** already have a `program_ratings` row for that `program_id`.

Replaying the last day later: no rating, no pack-complete feedback page. Completing the last lesson of a pack that is not active: no rating. Submitting stars twice updates the same row.

QA reset (one account, last day uncompleted, ratings cleared):

```
npx supabase@2.115.0 db query --linked -f scripts/qa_reset_pack_last_day.sql
```

Edit the email in that SQL file first. Do not put this in `supabase/migrations/`.

## Who sees the stars

Anyone on a binary that contains this UI, the first time they finish a pack. Current App Store users do **not** have this JS, so they never see it until they install the update. No remote flag is required.

`feature_flags.pack_rating_enabled` still exists (seeded `false`) but the client no longer reads it.

## Not this

- App Store review prompt: `mobile/lib/app-store-review-prompt.ts` + flag `app_store_review_prompt`
- Free-text pack feedback: `public.program_completion_feedback` + `POST /program-feedback`
