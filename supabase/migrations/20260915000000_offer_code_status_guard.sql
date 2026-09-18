-- Guard: once an offer code reaches 'redeemed' or 'retired', it can never go
-- back to 'available' or 'assigned'. Apple codes are irrevocable — a code
-- redeemed at Apple is burned forever, regardless of what our DB says.
-- This trigger prevents cleanup scripts or manual SQL from re-issuing burned
-- codes.

create or replace function public.trg_guard_offer_code_status()
returns trigger
language plpgsql
as $$
begin
  if OLD.status in ('redeemed', 'retired')
     and NEW.status in ('available', 'assigned') then
    raise exception
      'Cannot revert offer code % from % to % — Apple codes are irrevocable',
      OLD.id, OLD.status, NEW.status
      using errcode = 'check_violation';
  end if;
  return NEW;
end;
$$;

drop trigger if exists guard_offer_code_status on public.referral_offer_codes;

create trigger guard_offer_code_status
  before update on public.referral_offer_codes
  for each row
  execute function public.trg_guard_offer_code_status();
