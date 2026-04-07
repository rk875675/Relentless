-- Allow onboarding journal entries (future self exercise) before subscription.
alter table public.journal_entries
  drop constraint if exists journal_entries_entry_type_check;

alter table public.journal_entries
  add constraint journal_entries_entry_type_check
  check (entry_type in ('session', 'miss_reflection', 'onboarding_future_self'));
