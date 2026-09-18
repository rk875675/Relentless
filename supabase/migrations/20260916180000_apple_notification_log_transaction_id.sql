-- Persist Apple's per-period transactionId so renewal_number is a distinct
-- count, not a survival model. Additive only: existing rows stay valid and
-- the webhook already treats ledger writes as best-effort.

alter table public.apple_notification_log
  add column if not exists transaction_id text;

comment on column public.apple_notification_log.transaction_id is
  'Apple transactionId for this billing period. Used to compute renewal_number.';

create index if not exists idx_apple_notification_log_otid_txid
  on public.apple_notification_log (original_transaction_id, transaction_id)
  where transaction_id is not null;
