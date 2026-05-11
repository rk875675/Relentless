-- Add originalTransactionId to entitlements so Apple Server Notification webhooks
-- can look up the owning user without scanning entitlement_events JSONB metadata.
alter table public.entitlements
  add column if not exists original_transaction_id text;

create index if not exists idx_entitlements_original_transaction_id
  on public.entitlements (original_transaction_id)
  where original_transaction_id is not null;
