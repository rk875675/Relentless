-- Optional long-form "About me" copy for the coach card on the lesson ready
-- screen. Nullable and unpopulated at ship time; clients render nothing when
-- absent. (An optional coach intro video will be added alongside this later.)
alter table public.coaches add column if not exists long_bio text;
