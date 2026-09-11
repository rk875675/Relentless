# Referral offer — sandbox verification plan

PRD 10.5.11 puts sandbox verification between notification hardening and
TestFlight. This is what to run, and specifically what a device proves that a
server test cannot.

## What is already proven, and what isn't

The server chain is verified against the deployed functions on the real
project: signature encoding 15/15, sharer signing 40/40 against production
subscribers, invite list 15/15, invitee claim contract 20/20, Phase 5c
response contracts 46/46, pre-auth config 17/17.

**Three things no server test can prove**, because they need StoreKit and a
real Apple ID. These are the whole point of this pass:

1. **Apple accepts our promotional-offer signature.** The signature is
   verified correct against Apple's own DER validation, but only StoreKit can
   confirm Apple accepts it on a live purchase. A rejection surfaces as
   SKError 12 (invalid signature) or 18 (ineligible for offer).
2. **The offer-code redemption actually starts a subscription** on the SKU the
   server issued, and the resulting Apple notification carries `offerType 3`
   so reward release fires.
3. **The sharer's apply transaction is finished and does not leak.** This is
   the PRD 10.5.10 requirement, and the highest-risk item here — see
   [The leak check](#the-leak-check).

## Preconditions

- Sandbox offer codes are loaded: **200 available**, all `environment
  = 'sandbox'`. Nothing to load.
- `environment` on the server is a typed literal, always lowercase, so a
  sandbox tester's Apple account matches the sandbox pool. Verified.
- Production CSVs remain **unloaded**, deliberately. Load them only after this
  pass confirms each export's product/offer pairing.
- `referral_offer_enabled` is **off**. It must be turned on for this pass and
  turned back off afterwards. Tell me when you're ready and I'll flip it and
  flip it back, rather than leaving it on.
- A build containing this branch. The branch is committed locally but **has no
  upstream** — `git push --set-upstream origin feat/teammate-share-referral`
  is still yours to run.
- Two sandbox Apple IDs: one subscribed (the sharer), one that has never
  subscribed (the invitee). The invitee ID must be fresh, because an account
  that already used an offer is rejected by Apple, not by us.

## Test 1 — Invitee, pre-auth (the main case)

The path a person installing from a share message actually takes.

1. Sharer: Profile → INVITE → **Get an invite code** → share sheet appears.
2. Note the code and the invite row shows **Not used yet** with an expiry.
3. Invitee device, fresh install, no account. Go through onboarding to the
   paywall → **Have a code?** → enter the code.
4. Expect a plan picker. Pick the **same** cadence the sharer is on.
5. Expect to be routed to signup. Create an account.
6. Expect to land back on the paywall and the code sheet to **reopen by
   itself** at the redeem step, showing the code — the invitee should never
   type it twice.
7. **Continue** → Apple's redemption sheet. Enter the code (Apple's sheet
   cannot be pre-filled, so this step is manual by design).
8. Expect the subscription to start and the app to let you in.

Check afterwards:

- `referral_invites` row for that code: `status = 'claimed'` immediately, then
  `'converted'` once Apple's first charge notification lands.
- `referral_rewards`: one `role='gave'` row for the sharer and one
  `role='got'` row for the invitee.
- `entitlement_events` for the invitee carries `offer_type = 3`.

## Test 2 — Cadence swap

Repeat Test 1 but at step 4 pick the **other** cadence.

- The redeem pane must show a **different code** from the one entered.
- That code must be for the current live SKU of the chosen cadence
  (`com.relentless.monthly.b` / `com.relentless.annual.b`), never a legacy
  SKU.
- `referral_invites.alt_code_id` is set, and flipping back and forth must not
  consume a third code.

This is verified server-side already (20/20), so a failure here would point at
the client, not the claim logic.

## Test 3 — Sharer apply (the signature test)

Needs a sharer with a `ready` reward, which Test 1 produces.

1. Profile → INVITE. Expect **Your reward is ready to apply**.
2. **Apply my reward** → Apple's purchase sheet for the sharer's own SKU.
3. Confirm the purchase.
4. Expect **Submitted to Apple…** — and note that it must *not* claim the
   next charge is discounted.

Failure modes to watch for, because they are the informative ones:

- **SKError 12 / invalid signature** — the signing payload or key is wrong.
- **SKError 18 / ineligible for offer** — the offer isn't configured for that
  SKU in App Store Connect, or that account already used it.
- **Offer applies to the wrong SKU** — signing targets the *renewing* product,
  not the active one, so a sharer mid-cadence-change is the interesting case.

Then confirm Apple accepted it: the renewal notification carries
`offerType 2` with our offer identifier, and the reward flips to `applied`.
`rewardApplied` ("Apple has accepted your offer") must only appear after that.

## The leak check

The most important check in this document, and the easiest to skip.

An unfinished StoreKit transaction stays in the queue and is the **newest**
entry in `getAvailablePurchases()`. Every restore path in the app picks the
latest purchase — manual Restore, `EntitlementAutoRestore` on launch, the
stale-grace refresh in auth context, and the signup fallback. So an
unfinished promo purchase would be picked up and pushed at
`/purchases/restore` as if it were a new subscription.

After Test 3, on the sharer's device:

1. Force-quit and relaunch. `EntitlementAutoRestore` runs ~2.5s after launch
   when the user lacks premium — it should find nothing new.
2. Profile → **Restore Purchases**. The entitlement must be unchanged: same
   `product_id`, same `expires_at`, no new row in `entitlement_events`
   attributable to the promo purchase.
3. Confirm the promo transaction does not reappear across relaunches.

If the entitlement changes or a new event appears, `finishTransaction` did not
take effect and this must not go to TestFlight.

## Test 4 — Negative cases

Most of these are already proven server-side; run them on device only to
confirm the client surfaces them as the drafted copy rather than a raw error.

| Case | Expected |
| --- | --- |
| Sharer enters their own code | "You cannot use your own invite." |
| B shares back to A after A shared to B | Same message (reciprocity is permanently blocked) |
| Invitee who already used a referral | "This account has already used a referral offer." |
| Unknown / expired / exhausted code | "This code is not valid." — one shared error, by design |
| A creator promo code | Creator path, completely unchanged |
| Invite past its TTL | Invalid, and the sweeper returns the code to the pool |
| Flag turned off mid-test | Referral surfaces vanish; entering a code gives the generic invalid error |

The creator-code row is worth running deliberately: it is the regression that
would matter most, since that path is live and earning today.

## Test 5 — Popup

Not applicable yet. The home popup is the one surface not built, and it needs
a modal-priority decision first.

## Afterwards

- Turn `referral_offer_enabled` back off.
- Sandbox invites, rewards and claimed codes from testing should be cleared
  and the pool returned to 200 available, so later counts stay meaningful.
- Only then load the production CSVs, once this pass has confirmed which
  export maps to which product and offer.
