# Referral Feature — Handoff Prompt

> Copy everything below this line into a new chat.

---

Continue the teammate-share referral feature on branch `feat/teammate-share-referral`. Read `docs/PRD_relentless.md §10.5` first — product decisions there are locked, do not re-litigate them. Do not start a new feature. Do not "improve" live billing, restore, or creator promo codes.

## What this feature does

A paid subscriber (sharer) shares a code → their teammate (invitee) redeems it in Apple's offer-code sheet → invitee gets 20% off their first period → once Apple confirms payment, both sides earn a reward (invitee's discount is already applied; sharer gets a signed promotional offer for 20% off their next renewal). Server-authoritative, Apple IAP/StoreKit, feature-gated by `referral_offer_enabled` flag (currently ON for sandbox testing).

## What is built and deployed

All of these are live on the Supabase project (`tnetahaviblrrjixzvbd`):

### Database (migrations applied)
- `20260911000000_referral_offer_schema.sql` — `referral_invites`, `referral_rewards`, `referral_offer_codes` tables, `feature_flags` row, RLS
- `20260911050000_referral_reward_release.sql` — `release_referral_reward()` SQL function + `sweep_referral_invites()` cron
- Related hardening/fix migrations

### Edge Functions (deployed)
- `referral/index.ts` — `GET /config`, `GET /eligibility`, `POST /invites`, `POST /claim`, `POST /offer-signature`, `POST /reconcile`
- `apple-notifications/index.ts` — logs Apple S2S notifications, syncs entitlements, calls `release_referral_reward` when `offerType=3` + `SUBSCRIBED`/`DID_RENEW` arrives (but only if entitlement row already has matching OTID)
- `purchases/index.ts` — `/purchases/restore` now also checks `apple_notification_log` for `offerType=3` after entitlement upsert and calls `release_referral_reward` (deployed this session)
- `reconcile-entitlements/index.ts` — cron for entitlement drift

### Mobile (uncommitted on branch, NOT in a production build yet)
- `mobile/lib/referral.ts` — `isReferralEnabled`, `claimReferralCode`, `createReferralInvite`, `applySharerReward`, `presentAppleOfferCodeSheet`, `reconcileReferralPurchase`
- `mobile/lib/trusted-paywall-purchase.ts` — added `clearTrustedPaywallPurchase()` to prevent stale `isPostPaywall` bug
- `mobile/components/PromoCodeSheet.tsx` — code entry → cadence picker → redeem pane with tappable code pill (copy icon + "Tap to copy" hint), `handlePresentRedemption` with StoreKit retry loop, only fires `onRedeemed` if restore succeeds
- `mobile/components/onboarding/PaywallSuperwall.tsx` — promo sheet integration, `navigateToSignupForReferral` (clears trusted purchase), syncing overlay with `POST /referral/reconcile` polling, fallback "Almost there" screen
- `mobile/app/referral/index.tsx` — sharer's invite management screen
- `mobile/app/(tabs)/profile.tsx` — entry point to referral screen

### Offer codes
- 100 sandbox monthly codes + 100 sandbox annual codes loaded in `referral_offer_codes`
- 95 monthly / 100 annual still available
- Production CSVs NOT imported yet — that's a later step

## The flow (as designed)

### Invitee path
1. Opens app → sees paywall → taps "Have a code?" → enters invite code
2. Code not found in creator-promo table → falls through to referral system → cadence picker appears
3. Picks monthly or annual → `claim_referral_code` runs (needs account) → if no account: stash code + cadence, navigate to signup WITHOUT `postPaywall`
4. After signup, paywall remounts → detects stashed claim → reopens PromoCodeSheet in resume mode → auto-claims → shows issued Apple offer code
5. User copies code → taps Continue → Apple's offer-code sheet opens → user pastes code → pays discounted price
6. Apple sends `SUBSCRIBED INITIAL_BUY offerType=3` notification → `apple-notifications` handler processes it
7. `/purchases/restore` or `/referral/reconcile` links the OTID to the user → calls `release_referral_reward` → creates reward rows for both sides
8. Syncing overlay polls until entitlement is active → `completeOnboarding` → user enters app

### Sharer path
1. Active subscriber → Profile → "Invite a Teammate" → `POST /referral/invites` → gets code to share
2. When invitee's payment converts → `referral_rewards` row with `role='gave'` and `status='ready'` appears
3. Sharer taps "Apply Reward" → `POST /referral/offer-signature` → signed promotional offer → `requestPurchase` with `withOffer` → Apple charges discounted renewal
4. Apple's next notification carries `offerType=2` on renewalInfo → `confirm_sharer_offer_applied` marks reward as `applied`

## Current problem — sandbox testing is blocked

**Every sandbox test attempt has failed.** The offer code itself works — Apple accepts it and sends the correct `SUBSCRIBED INITIAL_BUY offerType=3 TEAMMATE20_MONTHLY_B` notification every time. But the entitlement never gets linked to the right user, so `release_referral_reward` never fires. **Zero `referral_rewards` rows have ever been created.**

### Why it keeps failing

The test uses two sandbox Apple IDs on the same physical device. StoreKit sandbox has a critical limitation: `getAvailablePurchases()` returns purchases from ALL sandbox accounts that have ever been active on that device, and "Clear Purchase History" in Settings does NOT actually clear subscription associations. This causes:

1. **OTID cross-contamination:** When `restorePurchasesViaStoreKit()` runs, it picks the most recent `transactionDate` — which may belong to the OTHER sandbox Apple ID's subscription. The wrong OTID gets sent to `/purchases/restore`, linking the wrong subscription to the wrong user.

2. **Superwall free trial pollution:** Going through onboarding on the sharer's sandbox ID triggers a free trial via Superwall (`offerType=1`, new OTID). When the invitee's sandbox ID then redeems the offer code, Apple creates a SECOND OTID. The entitlement is indexed to the trial OTID, so the offer-code notification can't find the user.

3. **"This offer can't be redeemed with your current subscription":** After enough cross-contamination, the sandbox Apple ID already has an active subscription from a previous test cycle, so Apple rejects the offer code entirely.

4. **App lets user in prematurely:** Superwall's own StoreKit cache detects the sandbox subscription from the OTHER Apple ID and grants access before the offer code is even redeemed.

### Fixes already applied (this session)

These are deployed but couldn't be properly validated because of the sandbox contamination:

1. **`POST /referral/reconcile`** (new endpoint, deployed) — Server-side OTID resolution. Instead of relying on StoreKit's `getAvailablePurchases()`, the server finds the correct OTID by matching the user's claimed invite → `offer_reference_name` → `apple_notification_log` where `offerType=3`. Updates entitlement, drains pending notifications, fires reward release. The syncing overlay polls this.

2. **`purchases/restore` reward release** (deployed) — After entitlement upsert, checks `apple_notification_log` for `offerType=3` on the same OTID and calls `release_referral_reward`.

3. **`handlePresentRedemption` guard** — `onRedeemed()` only fires if `restorePurchasesViaStoreKit` returned `ok: true`. If the user dismisses Apple's sheet without paying, they stay on the redeem pane instead of hitting the syncing overlay.

4. **Syncing overlay** — After `onRedeemed()`, shows "Activating your subscription…" spinner while polling `reconcileReferralPurchase()`. Falls back to "Almost there" + Restore button after ~22s timeout. User never sees the raw paywall after paying.

5. **`clearTrustedPaywallPurchase()`** — Prevents stale `isPostPaywall` from trapping the invitee in signup.tsx's verification loop.

6. **Code pill UX** — Tappable pill with border, clipboard icon, "Tap to copy" hint.

### What has NOT been validated

- `release_referral_reward` has never actually fired in sandbox (zero `referral_rewards` rows)
- Sharer reward application (`applySharerReward` / `POST /offer-signature`)
- `POST /referral/reconcile` endpoint (deployed but never reached by a clean test)
- The syncing overlay completing successfully (user always got stuck before reaching it properly)
- Cadence swap (invitee picks annual instead of monthly)
- Creator promo code regression (still works alongside referral)

## What needs to happen next

### 1. Get a clean sandbox test to pass
The sandbox environment is contaminated. Options:
- **Option A:** Use a DIFFERENT physical iOS device (or simulator) with fresh sandbox Apple IDs that have never touched the app
- **Option B:** Create brand-new sandbox Apple IDs in App Store Connect AND use them on a device where they've never been used
- **Option C:** Run the `release_referral_reward` function manually via SQL with known-good params to prove the function itself works, even if the full E2E can't be tested on this device

### 2. After Test 1 passes
- Turn `referral_offer_enabled` flag OFF
- Clean up sandbox test rows
- Import production offer-code CSVs (not in repo — user provides them)
- Decide Ambassador unlock threshold
- Get copy sign-off (PRD 10.5.9)
- Confirm remaining ASC prices
- Commit/push all uncommitted mobile changes
- Production EAS build (bump `buildNumber` + `versionCode`)

## DB access

The Supabase CLI is authenticated via Windows Credential Manager (`Supabase CLI:supabase`). You can query the live DB using the Management API:

```python
# Pattern used in this session — reads token from Windows Credential Manager
# then calls https://api.supabase.com/v1/projects/tnetahaviblrrjixzvbd/database/query
# See agent transcript for the full helper script.
```

Project ref: `tnetahaviblrrjixzvbd`. The CLI is installed via scoop (v2.75.0).

## Key files

- `docs/PRD_relentless.md` §10.5 — locked product spec
- `supabase/functions/referral/index.ts` — all referral endpoints
- `supabase/functions/apple-notifications/index.ts` — Apple S2S handler + reward release trigger
- `supabase/functions/purchases/index.ts` — restore path + reward release trigger
- `supabase/migrations/20260911000000_referral_offer_schema.sql` — tables + flag
- `supabase/migrations/20260911050000_referral_reward_release.sql` — `release_referral_reward()` + sweep
- `mobile/components/PromoCodeSheet.tsx` — invitee code entry + redeem UI
- `mobile/components/onboarding/PaywallSuperwall.tsx` — paywall + syncing overlay
- `mobile/lib/referral.ts` — client-side referral API
- `mobile/lib/iap-restore.ts` — StoreKit restore logic
- `mobile/lib/trusted-paywall-purchase.ts` — in-memory purchase state

## Hard constraints
- Do not break production. Feature is behind `referral_offer_enabled` flag.
- Do not modify `supabase/functions/purchases/restore` path behavior for non-referral users.
- No production offer-code CSVs in repo or chat.
- No secrets in files — env vars only.
- Minimal diffs. Zod strict schemas. Idempotent endpoints.
- After changing `supabase/functions/`, deploy the changed function.
- After changing `supabase/migrations/`, run `supabase db push`.
