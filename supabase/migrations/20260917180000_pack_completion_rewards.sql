-- One first-time pack-completion MAC bonus per user per program.
-- Written only via the programs Edge function (service role).

create table if not exists public.pack_completion_rewards (
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  program_id uuid        not null references public.programs (id) on delete cascade,
  claimed_at timestamptz not null default now(),
  primary key (user_id, program_id)
);

comment on table public.pack_completion_rewards is
  'First-time lesson-pack completion bonus. One claim per user per program. Service-role writes only.';

alter table public.pack_completion_rewards enable row level security;
-- No client policies: all writes are via service-role Edge function only.
