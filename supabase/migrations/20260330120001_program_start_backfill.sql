-- Profiles still without a start date (e.g. existing users before first Home on new app):
-- anchor to signup UTC date so library/catch-up is not stuck. New signups after this
-- migration keep NULL until `ensure_program_start` on first Home.

begin;

update public.profiles
set program_start_date = (created_at at time zone 'UTC')::date
where program_start_date is null;

commit;
