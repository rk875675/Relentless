-- Atomic complete_lesson: serialises all per-user completion writes under a
-- pg_advisory_xact_lock and uses INSERT ... ON CONFLICT DO NOTHING so that
-- double taps / retries / concurrent requests cannot duplicate side effects.
--
-- Same signature as the previous version (uuid, uuid, date). Adds two new
-- top-level fields to the returned jsonb: `is_duplicate` (boolean) and
-- `scores` / `decay` / `gains` / `lesson_title` (so MAC scoring is now done
-- inside the RPC instead of in the Edge function, eliminating the read-modify-
-- write race against user_progress).
--
-- KEEP IN SYNC WITH supabase/functions/_shared/scoring.ts
--   S.GAIN_STEPS        = [8.0, 3.5, 2.0, 1.0, 0.5]
--   S.DAILY_TIME_DECAY  = 2.0
--   S.MAX_SCORE / MIN_SCORE = 100 / 0
-- The TS file remains the source-of-truth for tunables; this SQL copy exists
-- only because the entire flow must run in one transaction.

begin;

drop function if exists public.complete_lesson(uuid, uuid, date);

create or replace function public.complete_lesson(
  p_user_id               uuid,
  p_lesson_id             uuid,
  p_completion_local_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted_id             uuid;
  v_completed_at            timestamptz;
  v_is_duplicate            boolean := false;
  v_lesson_completion_count int;
  v_lesson_title            text;
  v_categories              text[];
  v_cat                     text;
  v_daily_count             int;
  v_gain                    numeric;
  v_gains                   jsonb := '[]'::jsonb;
  v_mindfulness             numeric := 0;
  v_acceptance              numeric := 0;
  v_commitment              numeric := 0;
  v_progress_found          boolean := false;
  v_last_decay              date;
  v_yest                    date := p_completion_local_date - 1;
  v_gap                     int := 0;
  v_decay_amount            numeric := 0;
  v_new_last_decay          date;
  v_today                   date := p_completion_local_date;
  v_last_date               date;
  v_streak                  int;
  v_longest                 int;
  v_streaks_found           boolean := false;
  v_freebie_used            boolean;
begin
  -- Serialise all concurrent complete_lesson calls for this user. Lock is
  -- released at end of transaction.
  perform pg_advisory_xact_lock(
    hashtextextended('relentless:complete_lesson:' || p_user_id::text, 0)
  );

  -- Idempotent insert: unique (user_id, lesson_id, completion_local_date).
  insert into public.user_lesson_completions
    (user_id, lesson_id, completion_local_date)
  values
    (p_user_id, p_lesson_id, p_completion_local_date)
  on conflict (user_id, lesson_id, completion_local_date) do nothing
  returning id, completed_at into v_inserted_id, v_completed_at;

  if v_inserted_id is null then
    v_is_duplicate := true;
    select completed_at into v_completed_at
    from public.user_lesson_completions
    where user_id = p_user_id
      and lesson_id = p_lesson_id
      and completion_local_date = p_completion_local_date
    limit 1;
  end if;

  select count(*) into v_lesson_completion_count
  from public.user_lesson_completions
  where user_id = p_user_id and lesson_id = p_lesson_id;

  -- ====================================================================
  -- Profile updates (program_day, last_wod) — only on a NEW completion
  -- ====================================================================
  if not v_is_duplicate then
    update public.profiles p
    set last_wod_completion_local_date = p_completion_local_date
    where p.id = p_user_id
      and exists (
        select 1
        from public.program_schedule s
        where s.program_version = 'v1'
          and s.day_number = p.current_program_day
          and s.lesson_id = p_lesson_id
      );

    update public.profiles p
    set current_program_day = least(p.current_program_day + 1, 30)
    where p.id = p_user_id
      and p.current_program_day < 30
      and exists (
        select 1
        from public.program_schedule s
        where s.program_version = 'v1'
          and s.day_number = p.current_program_day
          and s.lesson_id = p_lesson_id
      );
  end if;

  -- ====================================================================
  -- Streak (Snapchat-style + freebie) — only on a NEW completion.
  -- We always read for response, but only mutate when not a duplicate.
  -- ====================================================================
  select current_streak, longest_streak, last_activity_date
  into v_streak, v_longest, v_last_date
  from public.user_streaks
  where user_id = p_user_id
  for update;

  v_streaks_found := found;

  if not v_is_duplicate then
    if not v_streaks_found then
      insert into public.user_streaks
        (user_id, current_streak, longest_streak, last_activity_date)
      values (p_user_id, 1, 1, v_today);
      v_streak := 1; v_longest := 1; v_last_date := v_today;

    elsif v_last_date = v_today then
      -- Already active today — no streak change.
      null;

    elsif v_last_date = v_today - 1 then
      v_streak  := v_streak + 1;
      v_longest := greatest(v_longest, v_streak);
      update public.user_streaks
      set current_streak     = v_streak,
          longest_streak     = v_longest,
          last_activity_date = v_today
      where user_id = p_user_id;

    elsif v_last_date = v_today - 2 then
      select freebie_used into v_freebie_used
      from public.profiles where id = p_user_id;

      if not coalesce(v_freebie_used, false) then
        v_streak  := v_streak + 1;
        v_longest := greatest(v_longest, v_streak);
        update public.profiles set freebie_used = true where id = p_user_id;
        update public.user_streaks
        set current_streak     = v_streak,
            longest_streak     = v_longest,
            last_activity_date = v_today
        where user_id = p_user_id;
      else
        v_streak  := 1;
        v_longest := greatest(v_longest, 1);
        update public.user_streaks
        set current_streak     = 1,
            longest_streak     = v_longest,
            last_activity_date = v_today
        where user_id = p_user_id;
      end if;

    else
      -- Gap >= 2 missed days: freebie covers at most 1, streak still breaks.
      v_streak  := 1;
      v_longest := greatest(v_longest, 1);
      update public.user_streaks
      set current_streak     = 1,
          longest_streak     = v_longest,
          last_activity_date = v_today
      where user_id = p_user_id;
    end if;
  end if;

  -- ====================================================================
  -- MAC scoring (decay then per-tag gain) — only on a NEW completion.
  -- FOR UPDATE on user_progress so concurrent progress-decay races serialise.
  -- ====================================================================
  select mindfulness_score, acceptance_score, commitment_score,
         last_decay_applied_local_date
  into v_mindfulness, v_acceptance, v_commitment, v_last_decay
  from public.user_progress
  where user_id = p_user_id
  for update;

  v_progress_found := found;

  if not v_progress_found then
    v_mindfulness := 0;
    v_acceptance  := 0;
    v_commitment  := 0;
    v_last_decay  := null;
  end if;

  if not v_is_duplicate then
    -- Decay (mirrors scoring.ts decayGapDays + applyDecay):
    --   gap = (today - 1) - last_decay, if positive; else 0.
    if v_last_decay is not null and v_yest > v_last_decay then
      v_gap := (v_yest - v_last_decay)::int;
      v_decay_amount := v_gap * 2.0;  -- S.DAILY_TIME_DECAY
      v_mindfulness := greatest(0, least(100, v_mindfulness - v_decay_amount));
      v_acceptance  := greatest(0, least(100, v_acceptance  - v_decay_amount));
      v_commitment  := greatest(0, least(100, v_commitment  - v_decay_amount));
    end if;

    select coalesce(array_agg(category), '{}'::text[])
    into v_categories
    from public.lesson_categories
    where lesson_id = p_lesson_id;

    select title into v_lesson_title
    from public.lessons where id = p_lesson_id;

    -- Per-tag stepped gain. Daily count is recomputed under the lock so
    -- concurrent calls cannot read the same baseline. The just-inserted row
    -- is already visible in this transaction.
    foreach v_cat in array v_categories loop
      select count(*) into v_daily_count
      from public.user_lesson_completions ulc
      join public.lesson_categories lc on lc.lesson_id = ulc.lesson_id
      where ulc.user_id = p_user_id
        and ulc.completion_local_date = p_completion_local_date
        and lc.category = v_cat;

      -- S.GAIN_STEPS = [8.0, 3.5, 2.0, 1.0, 0.5]
      v_gain := case
        when v_daily_count <= 1 then 8.0
        when v_daily_count = 2  then 3.5
        when v_daily_count = 3  then 2.0
        when v_daily_count = 4  then 1.0
        else 0.5
      end;

      if v_cat = 'mindfulness' then
        v_mindfulness := greatest(0, least(100, v_mindfulness + v_gain));
      elsif v_cat = 'acceptance' then
        v_acceptance  := greatest(0, least(100, v_acceptance  + v_gain));
      elsif v_cat = 'commitment' then
        v_commitment  := greatest(0, least(100, v_commitment  + v_gain));
      end if;

      v_gains := v_gains || jsonb_build_object(
        'category',    v_cat,
        'daily_count', v_daily_count,
        'amount',      v_gain
      );
    end loop;

    -- last_decay_applied_local_date semantics match the previous Edge rule:
    --   gap > 0          -> yesterday (decay covered through yesterday)
    --   prev was null    -> today     (start tracking from this completion)
    --   else             -> preserve  (no decay applied, leave marker as-is)
    if v_gap > 0 then
      v_new_last_decay := v_yest;
    elsif v_last_decay is null then
      v_new_last_decay := p_completion_local_date;
    else
      v_new_last_decay := v_last_decay;
    end if;

    insert into public.user_progress
      (user_id, mindfulness_score, acceptance_score, commitment_score,
       last_decay_applied_local_date)
    values
      (p_user_id, v_mindfulness, v_acceptance, v_commitment, v_new_last_decay)
    on conflict (user_id) do update set
      mindfulness_score             = excluded.mindfulness_score,
      acceptance_score              = excluded.acceptance_score,
      commitment_score              = excluded.commitment_score,
      last_decay_applied_local_date = excluded.last_decay_applied_local_date;
  end if;

  return jsonb_build_object(
    'completed_at',            v_completed_at,
    'is_duplicate',            v_is_duplicate,
    'lesson_completion_count', v_lesson_completion_count,
    'lesson_title',            v_lesson_title,
    'scores', jsonb_build_object(
      'mindfulness_score', v_mindfulness,
      'acceptance_score',  v_acceptance,
      'commitment_score',  v_commitment
    ),
    'decay', case
      when v_gap > 0 then
        jsonb_build_object('gap_days', v_gap, 'amount', v_decay_amount)
      else null
    end,
    'gains', v_gains,
    'streak', jsonb_build_object(
      'current_streak',     coalesce(v_streak, 0),
      'longest_streak',     coalesce(v_longest, 0),
      'last_activity_date', v_last_date
    )
  );
end;
$$;

revoke all on function public.complete_lesson(uuid, uuid, date) from public;
grant execute on function public.complete_lesson(uuid, uuid, date) to service_role;

commit;
