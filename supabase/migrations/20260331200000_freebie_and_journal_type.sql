-- Tier 2: streak freebie miss + journal entry type support.

begin;

-- One freebie miss per 30-day program (PRD §7).
-- Resets when a new program starts (not handled here — program reset is out of scope for v1).
alter table public.profiles
  add column if not exists freebie_used boolean not null default false;

comment on column public.profiles.freebie_used is
  'Whether the one-free-miss grace has been used in the current 30-day program (PRD §7).';

-- Distinguish session journals from miss-reflection journals.
alter table public.journal_entries
  add column if not exists entry_type text not null default 'session';

alter table public.journal_entries
  add constraint journal_entries_entry_type_check
  check (entry_type in ('session', 'miss_reflection'));

comment on column public.journal_entries.entry_type is
  'session = normal lesson/WOD journal, miss_reflection = prompted after a missed day.';

commit;
