-- Security fix: restrict complete_lesson RPC to service_role only.
-- Previously callable by any authenticated user via PostgREST with an
-- arbitrary p_user_id (IDOR). Matches the pattern used by ensure_program_start.

revoke all on function public.complete_lesson(uuid, uuid, date) from public;
grant execute on function public.complete_lesson(uuid, uuid, date) to service_role;
