create table if not exists public.audio_url_cache (
  path        text        primary key,
  signed_url  text        not null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

-- Only the service role (edge functions) should read/write this table.
-- Block all access from anon and authenticated roles.
alter table public.audio_url_cache enable row level security;
-- No RLS policies = no access for anon/authenticated; service role bypasses RLS.

-- Index to make cache cleanup queries fast.
create index if not exists audio_url_cache_expires_at_idx
  on public.audio_url_cache (expires_at);

comment on table public.audio_url_cache is
  'Server-side cache for Supabase Storage signed URLs. Reusing the same URL '
  'across requests allows the Smart CDN to warm up and serve audio from edge '
  'instead of hitting origin on every play.';
