-- Apple App Store Server Notification durability + offer metadata.
--
-- Closes two gaps in the live webhook, both prerequisites for the referral
-- offer (PRD 10.5):
--   1. No dedupe. Nothing recorded notificationUUID, so a redelivered or
--      duplicated notification could be applied more than once. Harmless for
--      idempotent status writes, unsafe for anything that pays out.
--   2. Offer metadata was never persisted. offerIdentifier / offerType are the
--      only signals Apple gives that a transaction came from an offer, so an
--      offer-driven paid conversion is currently invisible to the backend.
--
-- Purely additive: no existing table, column, index, policy, or behavior is
-- changed. The webhook treats this table as best-effort, so it keeps working
-- unchanged if this migration has not been applied yet.

create table if not exists public.apple_notification_log (
  notification_uuid text primary key,
  notification_type text,
  subtype text,
  original_transaction_id text,
  product_id text,
  -- Offer attached to the transaction itself (offerType 3 = offer code).
  offer_identifier text,
  offer_type smallint,
  offer_discount_type text,
  -- Offer attached to the UPCOMING renewal, i.e. a redeemed promotional offer
  -- that has not been charged yet.
  renewal_offer_identifier text,
  renewal_offer_type smallint,
  environment text,
  signed_date timestamptz,
  -- null = claimed but not yet applied. A retry is still allowed to process it;
  -- only a non-null value suppresses reprocessing.
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.apple_notification_log is
  'Idempotency ledger and offer metadata for App Store Server Notifications v2. Service-role only.';

create index if not exists idx_apple_notification_log_otid
  on public.apple_notification_log (original_transaction_id, created_at desc);

create index if not exists idx_apple_notification_log_offer
  on public.apple_notification_log (offer_identifier, created_at desc)
  where offer_identifier is not null;

-- Service-role only, matching entitlement_events and pending_apple_notifications:
-- RLS on with no policies means no client can read or write this table.
alter table public.apple_notification_log enable row level security;
