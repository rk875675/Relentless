-- Referral offer code importer (PRD 10.5) — server side of Phase 4a.
--
-- Two service-role-only functions. Nothing here is reachable by a client:
-- referral_offer_codes has RLS on with zero policies, both functions are
-- SECURITY INVOKER, and EXECUTE is revoked from anon/authenticated/public.
--
-- Why a function instead of a plain insert from the edge function: the code
-- pool's uniqueness is an EXPRESSION index (lower(code)), which PostgREST
-- cannot target with on_conflict. Doing the insert here lets one statement be
-- both bulk and idempotent via ON CONFLICT DO NOTHING, so a re-run of the same
-- CSV writes nothing and cannot partially fail.

-- ============================================================
-- Bulk, idempotent import of one App Store Connect code batch.
--
-- Codes are normalized (trimmed + uppercased) and de-duplicated inside the
-- call, so the caller does not have to. Returns counts only — never a code
-- value, since every row is a live App Store discount.
-- ============================================================

create or replace function public.import_referral_offer_codes(
  p_environment          text,
  p_product_id           text,
  p_offer_reference_name text,
  p_apple_expires_at     timestamptz,
  p_imported_batch       text,
  p_codes                text[],
  p_dry_run              boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_codes      text[];
  v_unique     int;
  v_inserted   int := 0;
  v_existing   int := 0;
  v_mismatched int := 0;
begin
  if p_environment not in ('production', 'sandbox') then
    raise exception 'environment must be production or sandbox';
  end if;

  select array_agg(distinct upper(btrim(c)))
    into v_codes
    from unnest(coalesce(p_codes, array[]::text[])) as c
   where btrim(c) <> '';

  v_unique := coalesce(array_length(v_codes, 1), 0);

  if v_unique = 0 then
    return jsonb_build_object(
      'requested', coalesce(array_length(p_codes, 1), 0),
      'unique_codes', 0,
      'inserted', 0,
      'already_present', 0,
      'mismatched_existing', 0,
      'dry_run', p_dry_run
    );
  end if;

  -- Rows that already exist but were imported under a DIFFERENT product,
  -- environment, or offer reference name. ON CONFLICT DO NOTHING would hide
  -- that silently, and it is the signature of importing the wrong CSV, so it
  -- is surfaced as a count (never as code values).
  select count(*)
    into v_mismatched
    from public.referral_offer_codes r
   where upper(r.code) = any (v_codes)
     and (r.product_id           <> p_product_id
       or r.environment          <> p_environment
       or r.offer_reference_name <> p_offer_reference_name);

  if p_dry_run then
    select count(*)
      into v_existing
      from public.referral_offer_codes r
     where upper(r.code) = any (v_codes);

    return jsonb_build_object(
      'requested', coalesce(array_length(p_codes, 1), 0),
      'unique_codes', v_unique,
      'inserted', 0,
      'already_present', v_existing,
      'mismatched_existing', v_mismatched,
      'dry_run', true
    );
  end if;

  with ins as (
    insert into public.referral_offer_codes
      (environment, product_id, offer_reference_name, code, apple_expires_at, imported_batch)
    select p_environment, p_product_id, p_offer_reference_name, c, p_apple_expires_at, p_imported_batch
      from unnest(v_codes) as c
    on conflict (lower(code)) do nothing
    returning 1
  )
  select count(*) into v_inserted from ins;

  return jsonb_build_object(
    'requested', coalesce(array_length(p_codes, 1), 0),
    'unique_codes', v_unique,
    'inserted', v_inserted,
    'already_present', v_unique - v_inserted,
    'mismatched_existing', v_mismatched,
    'dry_run', false
  );
end;
$$;


-- ============================================================
-- Pool stock, aggregated. Lets the operator verify an import and watch the
-- low-stock threshold without any code value leaving the database.
-- ============================================================

create or replace function public.referral_offer_code_stock()
returns table (
  environment          text,
  product_id           text,
  offer_reference_name text,
  status               text,
  code_count           bigint,
  earliest_expiry      timestamptz,
  batches              text[]
)
language sql
stable
security invoker
set search_path = public
as $$
  select r.environment,
         r.product_id,
         r.offer_reference_name,
         r.status,
         count(*)                                     as code_count,
         min(r.apple_expires_at)                      as earliest_expiry,
         array_agg(distinct r.imported_batch)
           filter (where r.imported_batch is not null) as batches
    from public.referral_offer_codes r
   group by 1, 2, 3, 4
   order by 1, 2, 3, 4;
$$;

revoke all on function public.import_referral_offer_codes(
  text, text, text, timestamptz, text, text[], boolean
) from public;
revoke all on function public.referral_offer_code_stock() from public;

revoke all on function public.import_referral_offer_codes(
  text, text, text, timestamptz, text, text[], boolean
) from anon, authenticated;
revoke all on function public.referral_offer_code_stock() from anon, authenticated;

grant execute on function public.import_referral_offer_codes(
  text, text, text, timestamptz, text, text[], boolean
) to service_role;
grant execute on function public.referral_offer_code_stock() to service_role;

comment on function public.import_referral_offer_codes(
  text, text, text, timestamptz, text, text[], boolean
) is
  'Idempotent bulk import of one App Store Connect offer-code batch into referral_offer_codes. Returns counts only, never code values. Service role only.';
comment on function public.referral_offer_code_stock() is
  'Aggregated code-pool counts by environment/product/offer/status. Returns no code values. Service role only.';
