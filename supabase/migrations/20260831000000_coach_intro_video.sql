-- ============================================================================
-- 20260831000000_coach_intro_video.sql
-- Add optional intro video support to the coaches table.
--
-- intro_video_path : storage path in the lesson-audio bucket (null = no video)
-- intro_video_approved : admin approval gate — false by default so a newly
--   synced video from the portal doesn't go live until explicitly approved via:
--     UPDATE public.coaches SET intro_video_approved = true WHERE coach_key = '<key>';
--
-- The edge function signs the path and returns intro_video_url only when
-- intro_video_approved = true, so the field is invisible to the app until
-- approved.
--
-- Also updates get_next_lesson_data RPC to pass both fields through so TS can
-- sign the URL in the same signing pass as avatar_url.
-- ============================================================================

begin;

-- 1. New columns on coaches
alter table public.coaches
  add column if not exists intro_video_path text,
  add column if not exists intro_video_approved boolean not null default false;

-- 2. Update the get_next_lesson_data RPC so it includes the new fields in the
--    coach JSON object. The TS layer signs the path; the RPC just passes it
--    through (same pattern as avatar_url).

create or replace function public.get_next_lesson_data(
  p_user_id   uuid,
  p_local_ymd date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile        record;
  v_active_program uuid;
  v_is_sprint      boolean;
  v_day            int;
  v_total_days     int := 0;
  v_effective_day  int;
  v_lesson_id      uuid;
  v_lesson         record;
  v_categories     text[];
  v_coach          record;
  v_coach_found    boolean := false;
  v_program        record;
  v_program_found  boolean := false;
  v_elapsed        int;
  v_completed_today boolean;
  v_completed_day  int;
  v_sprint_id      uuid := 'b0000000-0000-0000-0000-000000000001';
begin
  -- 1. Load profile (single read)
  select current_program_day, program_start_date,
         last_wod_completion_local_date, is_dev, active_program_id
    into v_profile
  from public.profiles
  where id = p_user_id;

  if not found then
    return jsonb_build_object('error', 'profile_not_found');
  end if;

  v_active_program := coalesce(v_profile.active_program_id, v_sprint_id);
  v_is_sprint := (v_active_program = v_sprint_id);
  v_day := v_profile.current_program_day;
  v_completed_today := (v_profile.last_wod_completion_local_date = p_local_ymd);
  v_completed_day := v_day - 1;

  -- 2. Resolve lesson ID + total days for this program/day
  if v_is_sprint then
    select lesson_id into v_lesson_id
    from public.program_schedule
    where program_version = 'v1' and day_number = v_day;

    select count(*) into v_total_days
    from public.program_schedule
    where program_version = 'v1';
  else
    select id into v_lesson_id
    from public.lessons
    where program_id = v_active_program
      and sequence = v_day
      and published = true;

    select coalesce(max(sequence), 0) into v_total_days
    from public.lessons
    where program_id = v_active_program
      and published = true;
  end if;

  -- Clamp day if beyond total
  v_effective_day := case
    when v_total_days > 0 and v_day > v_total_days then v_total_days
    else v_day
  end;

  -- Re-resolve if clamped
  if v_lesson_id is null and v_effective_day != v_day then
    if v_is_sprint then
      select lesson_id into v_lesson_id
      from public.program_schedule
      where program_version = 'v1' and day_number = v_effective_day;
    else
      select id into v_lesson_id
      from public.lessons
      where program_id = v_active_program
        and sequence = v_effective_day
        and published = true;
    end if;
  end if;

  -- 3. Pace gate (mid-pack): don't reveal tomorrow's lesson early
  if v_profile.is_dev is not true and v_profile.program_start_date is not null then
    v_elapsed := (p_local_ymd - v_profile.program_start_date)::int + 1;
    if v_effective_day > v_elapsed
       and not (v_total_days > 0 and v_effective_day >= v_total_days) then
      return jsonb_build_object(
        'lesson', null,
        'effective_day', v_effective_day,
        'total_days', v_total_days,
        'program_id', v_active_program,
        'is_sprint', v_is_sprint,
        'repeat_lesson', case
          when v_completed_today and v_completed_day >= 1 then
            public._resolve_repeat_lesson(v_active_program, v_is_sprint, v_completed_day)
          else null
        end
      );
    end if;
  end if;

  -- 4. No lesson found
  if v_lesson_id is null then
    return jsonb_build_object(
      'lesson', null,
      'effective_day', v_effective_day,
      'total_days', v_total_days,
      'program_id', v_active_program,
      'is_sprint', v_is_sprint,
      'repeat_lesson', case
        when v_completed_today and v_completed_day >= 1 then
          public._resolve_repeat_lesson(v_active_program, v_is_sprint, v_completed_day)
        else null
      end
    );
  end if;

  -- 5. Load lesson detail
  select id, coach_id, title, duration_seconds, lesson_type,
         voiceover_url, on_screen_text, reflection_prompt,
         content_blocks, sort_order, production_ready,
         description, program_id, sequence
    into v_lesson
  from public.lessons
  where id = v_lesson_id and published = true;

  if not found then
    return jsonb_build_object('error', 'lesson_not_found');
  end if;

  -- 6. Categories
  select coalesce(array_agg(category), '{}'::text[])
    into v_categories
  from public.lesson_categories
  where lesson_id = v_lesson_id;

  -- 7. Coach (if present) — now includes intro_video_path + intro_video_approved
  if v_lesson.coach_id is not null then
    select coach_key, name, credentials, bio, long_bio,
           avatar_url, offer_label, external_url,
           intro_video_path, intro_video_approved
      into v_coach
    from public.coaches
    where id = v_lesson.coach_id;
    v_coach_found := found;
  end if;

  -- 8. Program metadata (if present)
  if v_lesson.program_id is not null then
    select title, program_key
      into v_program
    from public.programs
    where id = v_lesson.program_id;
    v_program_found := found;
  end if;

  -- 9. Build final response
  return jsonb_build_object(
    'lesson', jsonb_build_object(
      'id', v_lesson.id,
      'coach_id', v_lesson.coach_id,
      'title', v_lesson.title,
      'duration_seconds', v_lesson.duration_seconds,
      'lesson_type', v_lesson.lesson_type,
      'voiceover_url', v_lesson.voiceover_url,
      'on_screen_text', v_lesson.on_screen_text,
      'reflection_prompt', v_lesson.reflection_prompt,
      'content_blocks', v_lesson.content_blocks,
      'sort_order', v_lesson.sort_order,
      'production_ready', v_lesson.production_ready,
      'description', v_lesson.description,
      'program_id', v_lesson.program_id,
      'sequence', v_lesson.sequence
    ),
    'categories', to_jsonb(v_categories),
    'coach', case when v_coach_found then jsonb_build_object(
      'coach_key', v_coach.coach_key,
      'name', v_coach.name,
      'credentials', v_coach.credentials,
      'bio', v_coach.bio,
      'long_bio', v_coach.long_bio,
      'avatar_url', v_coach.avatar_url,
      'offer_label', v_coach.offer_label,
      'external_url', v_coach.external_url,
      'intro_video_path', v_coach.intro_video_path,
      'intro_video_approved', v_coach.intro_video_approved
    ) else null end,
    'program_title', case when v_program_found then v_program.title else null end,
    'program_key', case when v_program_found then v_program.program_key else null end,
    'program_total_days', case
      when v_total_days > 0 then v_total_days
      else null
    end,
    'effective_day', v_effective_day,
    'total_days', v_total_days,
    'program_id', v_active_program,
    'is_sprint', v_is_sprint,
    'completed_today', v_completed_today,
    'repeat_lesson', case
      when v_completed_today and v_completed_day >= 1 then
        public._resolve_repeat_lesson(v_active_program, v_is_sprint, v_completed_day)
      else null
    end
  );
end;
$$;

revoke all on function public.get_next_lesson_data(uuid, date) from public;
grant execute on function public.get_next_lesson_data(uuid, date) to service_role;

commit;
