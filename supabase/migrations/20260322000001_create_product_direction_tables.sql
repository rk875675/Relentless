-- Migration: create_product_direction_tables
-- Phase 1b product-direction schema for Relentless
-- Source of truth: docs/schema_plan.md
-- Depends on: 20260322000000_create_infrastructure_tables.sql

-- ============================================================
-- Tables (dependency order)
-- ============================================================

create table public.coaches (
  id           uuid        primary key default gen_random_uuid(),
  name         text        not null,
  sport        text        not null default 'track',
  bio          text,
  external_url text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.lessons (
  id                uuid        primary key default gen_random_uuid(),
  coach_id          uuid        not null references public.coaches (id),
  title             text        not null,
  duration_seconds  integer     not null,
  lesson_type       text        not null default 'standard',
  voiceover_url     text,
  on_screen_text    text,
  reflection_prompt text,
  progress_metadata jsonb,
  sort_order        integer     not null default 0,
  published         boolean     not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.lesson_categories (
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  category  text not null check (category in ('control', 'commitment', 'challenge', 'confidence')),
  primary key (lesson_id, category)
);

create table public.user_lesson_completions (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references public.profiles (id) on delete cascade,
  lesson_id    uuid        not null references public.lessons (id),
  completed_at timestamptz not null default now()
);

create table public.user_progress (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null unique references public.profiles (id) on delete cascade,
  control_score    numeric     not null default 0,
  commitment_score numeric     not null default 0,
  challenge_score  numeric     not null default 0,
  confidence_score numeric     not null default 0,
  updated_at       timestamptz not null default now()
);

create table public.user_streaks (
  id                 uuid    primary key default gen_random_uuid(),
  user_id            uuid    not null unique references public.profiles (id) on delete cascade,
  current_streak     integer not null default 0,
  longest_streak     integer not null default 0,
  last_activity_date date,
  updated_at         timestamptz not null default now()
);

create table public.journal_entries (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references public.profiles (id) on delete cascade,
  lesson_id        uuid        references public.lessons (id),
  competition_date date,
  body             text        not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ============================================================
-- Triggers (set_updated_at function exists from Migration 1)
-- ============================================================

create trigger set_coaches_updated_at
  before update on public.coaches
  for each row
  execute function public.set_updated_at();

create trigger set_lessons_updated_at
  before update on public.lessons
  for each row
  execute function public.set_updated_at();

create trigger set_user_progress_updated_at
  before update on public.user_progress
  for each row
  execute function public.set_updated_at();

create trigger set_user_streaks_updated_at
  before update on public.user_streaks
  for each row
  execute function public.set_updated_at();

create trigger set_journal_entries_updated_at
  before update on public.journal_entries
  for each row
  execute function public.set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.coaches                enable row level security;
alter table public.lessons                enable row level security;
alter table public.lesson_categories      enable row level security;
alter table public.user_lesson_completions enable row level security;
alter table public.user_progress          enable row level security;
alter table public.user_streaks           enable row level security;
alter table public.journal_entries        enable row level security;

-- All product-direction tables are service-role only in V1.
-- Reads and writes go through Edge Functions with entitlement verification.
-- No direct client SELECT policies (matches endpoint_inventory.md).

-- ============================================================
-- Indexes
-- ============================================================

create index idx_lessons_coach_sort
  on public.lessons (coach_id, sort_order);

create index idx_lessons_published_sort
  on public.lessons (published, sort_order);

create index idx_user_lesson_completions_user_lesson
  on public.user_lesson_completions (user_id, lesson_id);

create index idx_user_lesson_completions_user_completed
  on public.user_lesson_completions (user_id, completed_at);

create index idx_journal_entries_user_created
  on public.journal_entries (user_id, created_at);
