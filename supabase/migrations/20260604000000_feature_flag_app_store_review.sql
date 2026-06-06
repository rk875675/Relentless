-- Add remote kill switch for the iOS App Store in-app review prompt.
-- Starts disabled; flip enabled = true only after the binary containing
-- this feature is live on the App Store.
insert into feature_flags (key, enabled)
values ('app_store_review_prompt', false)
on conflict (key) do nothing;
