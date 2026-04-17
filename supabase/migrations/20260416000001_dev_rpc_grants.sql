-- Grant execute on remaining dev RPCs to authenticated (missed in previous migration).
grant execute on function public.dev_set_program_day(integer) to authenticated;
grant execute on function public.dev_get_program_day() to authenticated;
grant execute on function public.dev_grant_trial() to authenticated;
