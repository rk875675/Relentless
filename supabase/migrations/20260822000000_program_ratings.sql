-- ============================================================
-- Program ratings
-- Stores 1–5 star ratings submitted at lesson-pack completion.
-- Writes happen only via the program-rating Edge function (service role).
-- Ratings are not surfaced to users; stored for future product decisions.
-- ============================================================

create table if not exists public.program_ratings (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users (id) on delete cascade,
  program_id   uuid        references public.programs (id) on delete set null,
  program_name text        check (program_name is null or char_length(program_name) <= 200),
  rating       smallint    not null check (rating between 1 and 5),
  app_build    text        check (app_build is null or char_length(app_build) <= 32),
  created_at   timestamptz not null default now()
);

comment on table public.program_ratings is
  'Star ratings (1–5) submitted at pack completion. Written via the program-rating Edge function (service role). Not shown to users.';

-- One rating per user per identified program (last write wins via upsert).
-- Rows with program_id IS NULL are not covered by this index (nulls not equal).
create unique index if not exists idx_program_ratings_user_program
  on public.program_ratings (user_id, program_id)
  where program_id is not null;

create index if not exists idx_program_ratings_created
  on public.program_ratings (created_at desc);

alter table public.program_ratings enable row level security;
-- No client policies: all writes are via service-role Edge function only.

-- Feature flag: starts disabled.
-- Flip to enabled = true only after the binary containing this feature is
-- approved and live on the App Store — same pattern as app_store_review_prompt.
insert into feature_flags (key, enabled)
values ('pack_rating_enabled', false)
on conflict (key) do nothing;
