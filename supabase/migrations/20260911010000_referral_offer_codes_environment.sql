-- Separate sandbox offer codes from production ones.
--
-- App Store Connect issues sandbox codes from the same offer as production
-- codes, and they are indistinguishable by format (both 18-char uppercase
-- alphanumeric). A sandbox code handed to a real customer fails at redemption
-- and burns their invite, so the environment must be a structural property of
-- the pool rather than a filename convention at import time.
--
-- Additive. Existing rows (there are none yet) default to 'production'.

alter table public.referral_offer_codes
  add column if not exists environment text not null default 'production';

alter table public.referral_offer_codes
  drop constraint if exists referral_offer_codes_environment_check;

alter table public.referral_offer_codes
  add constraint referral_offer_codes_environment_check
  check (environment in ('production', 'sandbox'));

comment on column public.referral_offer_codes.environment is
  'Apple environment the code is valid in. Sandbox codes only redeem against sandbox Apple IDs and must never be issued to a real user.';

-- The pool picker must always be environment-scoped, so make environment part
-- of the index rather than relying on the caller to filter.
drop index if exists idx_referral_offer_codes_pool;

create index idx_referral_offer_codes_pool
  on public.referral_offer_codes (environment, product_id, status, apple_expires_at);
