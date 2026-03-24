-- Migration: add complete_lesson RPC
-- Atomically records lesson completion, recalculates per-category progress,
-- and applies Snapchat-style streak logic.
-- Matches PRD §12.5 (sensitive multi-step actions must be atomic).

create or replace function public.complete_lesson(
  p_user_id  uuid,
  p_lesson_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_completed_at timestamptz;
  v_today        date;
  v_last_date    date;
  v_streak       int;
  v_longest      int;
  v_control      numeric;
  v_commitment   numeric;
  v_challenge    numeric;
  v_confidence   numeric;
begin
  -- 1. Record completion
  insert into public.user_lesson_completions (user_id, lesson_id)
  values (p_user_id, p_lesson_id)
  returning completed_at into v_completed_at;

  -- 2. Per-category progress: (distinct completed / total published) * 100
  with cat_stats as (
    select
      lc.category,
      count(distinct lc.lesson_id)  as total_lessons,
      count(distinct ulc.lesson_id) as completed_lessons
    from public.lesson_categories lc
    join public.lessons l
      on l.id = lc.lesson_id and l.published = true
    left join public.user_lesson_completions ulc
      on ulc.lesson_id = lc.lesson_id and ulc.user_id = p_user_id
    group by lc.category
  )
  select
    coalesce((select round(completed_lessons::numeric
                           / nullif(total_lessons, 0) * 100, 2)
              from cat_stats where category = 'control'), 0),
    coalesce((select round(completed_lessons::numeric
                           / nullif(total_lessons, 0) * 100, 2)
              from cat_stats where category = 'commitment'), 0),
    coalesce((select round(completed_lessons::numeric
                           / nullif(total_lessons, 0) * 100, 2)
              from cat_stats where category = 'challenge'), 0),
    coalesce((select round(completed_lessons::numeric
                           / nullif(total_lessons, 0) * 100, 2)
              from cat_stats where category = 'confidence'), 0)
  into v_control, v_commitment, v_challenge, v_confidence;

  -- 3. Upsert progress row
  insert into public.user_progress
    (user_id, control_score, commitment_score, challenge_score, confidence_score)
  values
    (p_user_id, v_control, v_commitment, v_challenge, v_confidence)
  on conflict (user_id) do update set
    control_score    = excluded.control_score,
    commitment_score = excluded.commitment_score,
    challenge_score  = excluded.challenge_score,
    confidence_score = excluded.confidence_score;

  -- 4. Streak (Snapchat-style, UTC date boundaries)
  v_today := (now() at time zone 'UTC')::date;

  select current_streak, longest_streak, last_activity_date
  into v_streak, v_longest, v_last_date
  from public.user_streaks
  where user_id = p_user_id
  for update;                       -- row-level lock against concurrent calls

  if not found then
    -- First-ever completion: streak starts at 1
    insert into public.user_streaks
      (user_id, current_streak, longest_streak, last_activity_date)
    values (p_user_id, 1, 1, v_today);
    v_streak  := 1;
    v_longest := 1;

  elsif v_last_date = v_today then
    -- Already active today — no streak change
    null;

  elsif v_last_date = v_today - 1 then
    -- Consecutive day — increment
    v_streak  := v_streak + 1;
    v_longest := greatest(v_longest, v_streak);
    update public.user_streaks
    set current_streak     = v_streak,
        longest_streak     = v_longest,
        last_activity_date = v_today
    where user_id = p_user_id;

  else
    -- Missed a day — reset to 1
    v_streak  := 1;
    v_longest := greatest(v_longest, 1);
    update public.user_streaks
    set current_streak     = 1,
        longest_streak     = v_longest,
        last_activity_date = v_today
    where user_id = p_user_id;
  end if;

  return jsonb_build_object(
    'completed_at', v_completed_at,
    'progress', jsonb_build_object(
      'control_score',    v_control,
      'commitment_score', v_commitment,
      'challenge_score',  v_challenge,
      'confidence_score', v_confidence
    ),
    'streak', jsonb_build_object(
      'current_streak',    v_streak,
      'longest_streak',    v_longest,
      'last_activity_date', v_today
    )
  );
end;
$$;
