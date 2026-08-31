-- Daily new users + promo redemptions, last 16 days
select
  to_char(d::date, 'YYYY-MM-DD') as day_utc,
  coalesce(s.new_users, 0) as new_users,
  coalesce(p.promo_redemptions, 0) as promo_redemptions
from generate_series(
  (now() at time zone 'utc')::date - 15,
  (now() at time zone 'utc')::date,
  interval '1 day'
) as d
left join (
  select created_at::date as day, count(*) as new_users
  from public.profiles
  where created_at >= now() - interval '16 days'
  group by 1
) s on s.day = d::date
left join (
  select redeemed_at::date as day, count(*) as promo_redemptions
  from public.promo_code_redemptions
  where redeemed_at >= now() - interval '16 days'
  group by 1
) p on p.day = d::date
order by d;

-- Weekly active users by last_activity_date (streak), last 8 weeks
select
  to_char(w.week_start, 'YYYY-MM-DD') as week_starting_monday_utc,
  count(*) filter (where s.last_activity_date >= w.week_start::date
                     and s.last_activity_date < (w.week_start + interval '7 days')::date) as wau_by_streak
from generate_series(
  date_trunc('week', now() - interval '7 weeks'),
  date_trunc('week', now()),
  interval '1 week'
) as w(week_start)
left join public.user_streaks s on true
group by w.week_start
order by w.week_start;
