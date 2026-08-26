-- C4: Enable RLS on programs (the only content table missing it).
-- Pattern: RLS on + zero client policies = deny-all for anon/authenticated via PostgREST.
-- Edge Functions use service-role and are unaffected.
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
