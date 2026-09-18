-- Silent per-sharer claim cap: 10 teammates per billing period.
-- The 11th claim returns the same invalid result as a bad code.
-- UI does not advertise this number.

update public.feature_flags
   set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
         'max_open_invites_per_period', 10
       )
 where key = 'referral_offer_enabled';

create or replace function public.claim_referral_code(
  p_code              text,
  p_user_id           uuid,
  p_target_product_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_token        public.referral_share_tokens%rowtype;
  v_typed        public.referral_offer_codes%rowtype;
  v_handle       public.referral_offer_codes%rowtype;
  v_alt          public.referral_offer_codes%rowtype;
  v_issued       public.referral_offer_codes%rowtype;
  v_invite       public.referral_invites%rowtype;
  v_claimer_otid text;
  v_is_replay    boolean := false;
  v_period_end   timestamptz;
  v_product_id   text;
  v_used         int;
  v_max          int := 10;
  v_ttl          int := 90;
begin
  select coalesce((metadata->>'max_open_invites_per_period')::int, 10),
         coalesce((metadata->>'invite_ttl_days')::int, 90)
    into v_max, v_ttl
    from public.feature_flags
   where key = 'referral_offer_enabled';

  select original_transaction_id
    into v_claimer_otid
    from public.entitlements
   where user_id = p_user_id;

  select *
    into v_token
    from public.referral_share_tokens
   where lower(code) = lower(btrim(p_code))
   for update;

  if found then
    if v_token.user_id = p_user_id
       or (v_claimer_otid is not null
           and v_claimer_otid = v_token.original_transaction_id) then
      return jsonb_build_object('result', 'self_share');
    end if;

    if exists (
      select 1
        from public.referral_invites r
       where r.sharer_user_id = p_user_id
         and r.claimed_by_user_id = v_token.user_id
         and r.claimed_by_user_id is not null
    ) then
      return jsonb_build_object('result', 'reciprocity_blocked');
    end if;

    if v_claimer_otid is not null and exists (
      select 1
        from public.referral_rewards
       where original_transaction_id = v_claimer_otid
         and role = 'received'
    ) then
      return jsonb_build_object('result', 'already_received');
    end if;

    select *
      into v_invite
      from public.referral_invites
     where sharer_user_id = v_token.user_id
       and claimed_by_user_id = p_user_id
       and status in ('claimed', 'converted')
     order by claimed_at desc
     limit 1
     for update;

    if found and v_invite.status = 'converted' then
      return jsonb_build_object('result', 'already_received');
    elsif found then
      v_is_replay := true;
    else
      select expires_at, product_id
        into v_period_end, v_product_id
        from public.entitlements
       where user_id = v_token.user_id;

      select count(*)
        into v_used
        from public.referral_invites
       where sharer_original_transaction_id = v_token.original_transaction_id
         and status in ('open', 'claimed', 'converted')
         and sharer_period_end is not distinct from v_period_end;

      if v_used >= v_max then
        return jsonb_build_object('result', 'invalid');
      end if;

      select *
        into v_issued
        from public.referral_offer_codes
       where environment = v_token.environment
         and product_id = p_target_product_id
         and status = 'available'
         and apple_expires_at > now()
       order by apple_expires_at asc, created_at asc
       for update skip locked
       limit 1;

      if not found then
        return jsonb_build_object('result', 'pool_empty');
      end if;

      update public.referral_offer_codes
         set status = 'assigned'
       where id = v_issued.id;

      insert into public.referral_invites (
        sharer_user_id, sharer_original_transaction_id, sharer_product_id,
        sharer_period_end, code_id, issued_code_id, invitee_product_id,
        status, claimed_by_user_id, claimed_original_transaction_id,
        claimed_at, ttl_expires_at
      ) values (
        v_token.user_id, v_token.original_transaction_id,
        coalesce(v_product_id, p_target_product_id),
        v_period_end, v_issued.id, v_issued.id, v_issued.product_id,
        'claimed', p_user_id, v_claimer_otid,
        now(), now() + make_interval(days => v_ttl)
      )
      returning * into v_invite;

      return jsonb_build_object(
        'result',           'claimed',
        'replay',           false,
        'invite_id',        v_invite.id,
        'code',             v_issued.code,
        'product_id',       v_issued.product_id,
        'apple_expires_at', v_issued.apple_expires_at
      );
    end if;
  else
    select *
      into v_typed
      from public.referral_offer_codes
     where lower(code) = lower(btrim(p_code))
     for update;

    if not found then
      return jsonb_build_object('result', 'invalid');
    end if;

    select *
      into v_invite
      from public.referral_invites
     where code_id = v_typed.id
        or alt_code_id = v_typed.id
     for update;

    if not found then
      return jsonb_build_object('result', 'invalid');
    end if;

    if v_invite.sharer_user_id = p_user_id
       or (v_claimer_otid is not null
           and v_claimer_otid = v_invite.sharer_original_transaction_id) then
      return jsonb_build_object('result', 'self_share');
    end if;

    if v_invite.status = 'claimed' and v_invite.claimed_by_user_id = p_user_id then
      v_is_replay := true;
    elsif v_invite.status <> 'open' then
      return jsonb_build_object('result', 'invalid');
    elsif v_invite.ttl_expires_at < now() then
      return jsonb_build_object('result', 'invalid');
    end if;

    if exists (
      select 1
        from public.referral_invites r
       where r.sharer_user_id = p_user_id
         and r.claimed_by_user_id = v_invite.sharer_user_id
         and r.claimed_by_user_id is not null
    ) then
      return jsonb_build_object('result', 'reciprocity_blocked');
    end if;

    if v_claimer_otid is not null and exists (
      select 1
        from public.referral_rewards
       where original_transaction_id = v_claimer_otid
         and role = 'received'
    ) then
      return jsonb_build_object('result', 'already_received');
    end if;
  end if;

  select * into v_handle
    from public.referral_offer_codes
   where id = v_invite.code_id
   for update;

  if v_handle.product_id = p_target_product_id then
    v_issued := v_handle;
  else
    if v_invite.alt_code_id is not null then
      select * into v_alt
        from public.referral_offer_codes
       where id = v_invite.alt_code_id
       for update;
      if found and v_alt.product_id = p_target_product_id then
        v_issued := v_alt;
      end if;
    end if;

    if v_issued.id is null then
      select *
        into v_alt
        from public.referral_offer_codes
       where environment = v_handle.environment
         and product_id = p_target_product_id
         and status = 'available'
         and apple_expires_at > now()
       order by apple_expires_at asc, created_at asc
       for update skip locked
       limit 1;

      if not found then
        return jsonb_build_object('result', 'pool_empty');
      end if;

      update public.referral_offer_codes
         set status = 'assigned'
       where id = v_alt.id;

      update public.referral_invites
         set alt_code_id = v_alt.id
       where id = v_invite.id;

      v_issued := v_alt;
    end if;
  end if;

  update public.referral_invites
     set issued_code_id                  = v_issued.id,
         invitee_product_id              = v_issued.product_id,
         status                          = 'claimed',
         claimed_by_user_id              = p_user_id,
         claimed_original_transaction_id = v_claimer_otid,
         claimed_at                      = coalesce(claimed_at, now())
   where id = v_invite.id;

  return jsonb_build_object(
    'result',           'claimed',
    'replay',           v_is_replay,
    'invite_id',        v_invite.id,
    'code',             v_issued.code,
    'product_id',       v_issued.product_id,
    'apple_expires_at', v_issued.apple_expires_at
  );
end;
$$;
