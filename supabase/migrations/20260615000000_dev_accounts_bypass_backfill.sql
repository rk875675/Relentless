-- One-time backfill so existing dev/QA accounts (profiles.is_dev = true) work on the
-- CURRENTLY SHIPPED app build, which routes purely on profiles.onboarding_completed +
-- entitlements.status. The client-side dev bypass (treat is_dev as onboarded + entitled)
-- ships in the next app build; this keeps current dev accounts signing in correctly in
-- the interim. Touches ONLY is_dev rows. Mirrors the dev_grant_trial pattern (365-day trial).

begin;

-- 1) Treat dev accounts as onboarded (skip the welcome/onboarding gate).
update public.profiles
set onboarding_completed = true,
    updated_at           = now()
where is_dev = true
  and onboarding_completed is distinct from true;

-- 2) Guard: ensure every dev account has an entitlements row. handle_new_user creates
--    one for every signup, but this protects against any legacy account missing it.
insert into public.entitlements (user_id, status, starts_at, expires_at)
select p.id, 'trial', now(), now() + interval '365 days'
from public.profiles p
left join public.entitlements e on e.user_id = p.id
where p.is_dev = true
  and e.user_id is null;

-- 3) Grant a fresh 365-day trial to dev accounts that are not already on a real
--    'active' subscription (never downgrade a genuinely paid dev account).
update public.entitlements e
set status     = 'trial',
    starts_at  = now(),
    expires_at = now() + interval '365 days',
    updated_at = now()
from public.profiles p
where e.user_id = p.id
  and p.is_dev = true
  and e.status <> 'active';

commit;
