-- Referral offer — confirm a sharer's reward was actually applied (Phase 4d).
--
-- PRD 10.5.6: "sharer applied" means Apple reports the signed offer attached
-- to their next renewal. Minting a signature is not that — the signature only
-- authorizes the purchase, and the sharer may never complete it. So the
-- applied state is set from Apple's renewalInfo and never from the client.
--
-- Matching on offer_identifier as well as the Apple account means an
-- unrelated promotional offer on the same subscription can never mark a
-- referral reward applied.

create or replace function public.confirm_sharer_offer_applied(
  p_original_transaction_id text,
  p_offer_identifier        text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_reward public.referral_rewards%rowtype;
begin
  select *
    into v_reward
    from public.referral_rewards
   where original_transaction_id = p_original_transaction_id
     and role = 'gave'
     and offer_identifier = p_offer_identifier
     and status in ('ready', 'applied')
   order by created_at desc
   limit 1
   for update;

  if not found then
    return jsonb_build_object('result', 'no_reward');
  end if;

  if v_reward.status = 'applied' then
    return jsonb_build_object('result', 'already_applied', 'reward_id', v_reward.id);
  end if;

  update public.referral_rewards
     set status             = 'applied',
         applied_at         = coalesce(applied_at, now()),
         apple_confirmed_at = coalesce(apple_confirmed_at, now())
   where id = v_reward.id;

  return jsonb_build_object(
    'result',     'applied',
    'reward_id',  v_reward.id,
    'period_end', v_reward.period_end
  );
end;
$$;

revoke all on function public.confirm_sharer_offer_applied(text, text)
  from public, anon, authenticated;
grant execute on function public.confirm_sharer_offer_applied(text, text) to service_role;
