# Referral offer — copy for approval

Every user-facing string in the teammate-share feature. PRD 10.5.9 says final
strings are not locked and must not be invented during implementation, so
these are **drafts for your approval**, not decisions. Nothing here ships as
final until you mark it approved.

The code currently carries these same drafts inside blocks marked
`HUMAN INPUT NEEDED`, one per surface, so replacing approved copy is a
find-and-paste into three files — never a hunt through components. All three
surfaces are now built, so this table and the code are the same strings.

## The five rules every string below has to satisfy

From PRD 10.5.9:

1. Anchor on the teammate's **first payment**, never on trial completion — a
   previously-expired invitee gets no trial.
2. Say the discount covers **one billing period** and then returns to full
   price.
3. Never say "this month" — the reader may be on annual.
4. Never claim the sharer's next charge is discounted **before Apple has
   accepted** the promotional offer.
5. "20% off" may only appear where the configured App Store price point is at
   least 20% below list.

Rule 5 is the one that needs a decision before any of this can say a number.
See [The 20% question](#the-20-question).

---

## Decision needed first: the 20% question

One string is shown to users on four different SKUs, and rule 5 binds it to
the **worst** of them. Three have an exact 20% point:

| SKU | List | 0.8 × list | Point | Actual discount |
| --- | --- | --- | --- | --- |
| `com.relentless.monthly` | $4.99 | $3.992 | $3.99 | 20.0% ✓ |
| `com.relentless.annual` | $39.99 | $31.992 | $31.99 | 20.0% ✓ |
| `com.relentless.annual.b` | $59.99 | $47.992 | $47.99 | 20.0% ✓ |
| `com.relentless.monthly.b` | $7.99 | $6.392 | **?** | **decision** |

The $7.99 monthly SKU has **no exact 20% point**. Rule 5 caps it at $6.39, so
the choice is:

| Point | Discount | May say "20% off"? | Cost to you |
| --- | --- | --- | --- |
| $6.49 | 18.8% | **No** — overstates | cheapest |
| $6.39 | 20.0% | Yes, exactly | on the line |
| $5.99 | 25.0% | Yes (understates, which rule 5 permits) | 5 points of extra margin |

$6.39 is the only one that is both compliant and not expensive, **if Apple
offers it** — it is not a classic tier, so it may only exist in the extended
price list. Worth checking before committing to a number in copy.

**My recommendation: keep the percentage out of the shared strings entirely**
and say "a discount on one billing period". That is accurate on all four SKUs
whatever you pick, needs no per-SKU copy branching, and cannot drift out of
compliance if pricing changes later. The drafts below are written that way.

The cost of that choice is real: "20% off" is a stronger hook than "a
discount", and this popup gets at most two showings a month to make its case.
The alternative that keeps the number is to branch copy per SKU, which means
every surface below gains a conditional and the 20% claim has to be re-checked
against ASC on every future price change. That is the trade I would not make
for one SKU, but it is your call.

**Needed from you:** the configured price point for `SHARER20_MONTHLY_B` and
`TEAMMATE20_MONTHLY_B`, and whether you want the percentage stated at all.

---

## Surface 1 — Invitee code entry (`mobile/components/PromoCodeSheet.tsx`)

The invitee enters a code, picks a plan, and is handed the code to redeem in
Apple's sheet. Note that Apple's redemption sheet **cannot be pre-filled**, so
the code has to be shown for the user to carry across, and it is not always
the string they typed: picking the cadence the sharer didn't reserve issues
that plan's code instead. `redeemInstructions` is doing the heavy lifting
there and is the string I'd most want you to rewrite.

| Key | Draft | Notes |
| --- | --- | --- |
| `cadenceTitle` | Choose your plan | Shown after a referral code is recognized. |
| `cadenceMonthly` | Monthly | Price intentionally absent — see the 20% question. |
| `cadenceAnnual` | Annual | |
| `cadenceBack` | Back | |
| `redeemTitle` | Redeem in the App Store | |
| `redeemInstructions` | Enter this code on the next screen to start your subscription. Press and hold to copy it. | Must work even when the code shown differs from the one typed. |
| `redeemOpen` | Continue | Opens Apple's sheet. |
| `redeemDone` | Done | Dismisses without redeeming; the code stays bound to them. |
| `referralUnavailable` | This offer is temporarily unavailable. Please try again later. | Pool empty or feature mid-rollout. |
| `referralSelfShare` | You cannot use your own invite. | Also covers blocked reciprocity. |
| `referralAlreadyReceived` | This account has already used a referral offer. | One received reward per account, ever. |

Unchanged and already live: `title`, `placeholder`, `submit`, `cancel`,
`invalid`, `network`, `alreadyUsed`, `alreadyEntitled`, `redeemFailed`. The
creator path keeps them byte-for-byte. Note `invalid` ("This code is not
valid.") is also what an unknown, exhausted, expired, or wrong-type referral
code returns, deliberately — PRD 10.5.7 requires one shared error so the
response never reveals which code system was probed.

## Surface 2 — Profile referral space (`mobile/app/referral/index.tsx`)

Share-only: invite status, how the offer works, and the apply action. No code
entry, because an active subscriber cannot use a new-subscriber offer code.

### How it works

| Key | Draft |
| --- | --- |
| `title` | Invite a teammate |
| `howTitle` | How it works |
| `howBody` | Send a teammate your invite code. When they subscribe and their first payment goes through, you each get one discounted billing period, then both return to full price. |
| `capDisclosure` | You can earn one reward per billing period. Extra conversions in the same period do not add another. |

`howBody` carries rules 1, 2 and 3 at once: "their first payment goes
through" (not trial), "one discounted billing period", "both return to full
price", and no "this month". `capDisclosure` satisfies PRD 10.5.7's
requirement that the per-period limit is disclosed **before** the user
invites anyone.

### Sharing

| Key | Draft |
| --- | --- |
| `shareCta` | Get an invite code |
| `shareMessage` | Join me on Relentless. Use code {CODE} when you subscribe.\n\n{APP_STORE_LINK} |

The message carries the App Store link plus the code as text, per PRD 10.5.4.
Apple redeem URLs are deliberately not distributed. **Worth your attention:**
this message contains a live Apple offer code in plain text, which you already
accepted as a known tradeoff.

### Invite status

| Key | Draft |
| --- | --- |
| `invitesTitle` | Your invites |
| `invitesEmpty` | You have not created an invite yet. |
| `statusOpen` | Not used yet |
| `statusClaimed` | Waiting on their first payment |
| `statusConverted` | Reward earned |
| `expiresPrefix` | Expires |

`statusClaimed` is the rule-1 anchor: the teammate has redeemed but the
sharer has earned nothing until the first charge actually succeeds.

### Reward and apply

| Key | Draft |
| --- | --- |
| `rewardTitle` | Your reward |
| `rewardPending` | Waiting on your teammate's first payment. |
| `rewardReady` | Your reward is ready to apply. |
| `rewardApplied` | Applied. Apple has accepted your offer. |
| `applyCta` | Apply my reward |
| `applySubmitted` | Submitted to Apple. Your discount takes effect at your next billing date once Apple confirms it. |

`applySubmitted` is the rule-4 string and the most legally sensitive one here.
It deliberately does **not** say the next charge is discounted, because at
that moment Apple has only received the offer — acceptance arrives later on
the renewal notification. `rewardApplied` is the only string that states
acceptance, and it is shown only after Apple confirms it.

### Ineligible states

| Key | Draft | Server reasons it covers |
| --- | --- | --- |
| `ineligibleSubscription` | Inviting is available to subscribers on an active plan. | `no_apple_subscription`, `not_active`, `revoked`, `no_original_transaction_id` |
| `ineligibleTrial` | Inviting unlocks after your first payment goes through. | `trial_not_paid` |
| `ineligibleAutoRenewOff` | Turn your subscription renewal back on to invite a teammate. | `auto_renew_off` |
| `ineligibleBilling` | We could not confirm your subscription with the App Store. | `billing_retry`, `billing_grace`, `apple_unavailable` |
| `ineligibleSlotUsed` | You have already earned your reward for this billing period. You can invite again next period. | `give_slot_used` |
| `ineligibleUnavailable` | Inviting is temporarily unavailable. Please try again later. | `pool_unavailable`, `feature_disabled`, `unknown_cadence` |

`ineligibleTrial` exists because a trial user *is* on an active plan, so
`ineligibleSubscription` would have misled them — the sharer has to have paid
at least once. All 13 eligibility reasons the server can return are covered
above, so no state falls through to a wrong message.

### Errors

| Key | Draft |
| --- | --- |
| `errorLoad` | Could not load your invites. Pull down to try again. |
| `errorShare` | Could not create an invite code. Please try again. |
| `errorApply` | Could not apply your reward. Please try again. |
| `errorApplyOfferActive` | You already have an offer on your next renewal. Apple allows only one at a time. |

## Surface 3 — Home popup (`mobile/components/ReferralPopup.tsx`)

Shown after a lesson, at most twice per calendar month, only when eligible.
Built and carrying these drafts. The modal-priority question that used to sit
here is decided and is not a copy matter: the popup is the lowest-priority
prompt on Home and yields to the streak freebie, push prompt, miss-reflection
cards, schedule sheet, and the native review dialog.

| Key | Draft |
| --- | --- |
| `popupTitle` | Train with a teammate |
| `popupBody` | Invite a teammate. When their first payment goes through, you each get one discounted billing period, then you both return to full price. |
| `popupPrimary` | Invite a teammate |
| `popupDismiss` | Not now |

`popupBody` completes rule 2 with "then you both return to full price", which
an earlier draft of this table omitted. `popupPrimary` is deliberately **not**
`shareCta` ("Get an invite code") even though both lead toward the same place:
the popup only opens the referral screen, and the code is issued by a separate
tap once there, so promising a code on this button would be a lie one screen
early. It does repeat the title's wording, which is the weakest thing on this
surface and a good candidate for your rewrite.

---

## How to return this

Mark each string keep / reword / replace and hand it back. I'll drop the
approved strings into the `HUMAN INPUT NEEDED` blocks and remove the
placeholder warnings. Until then the feature stays behind
`referral_offer_enabled`, which is off.

You do not have to review all 40-odd strings to unblock this. Five carry
almost all of the risk, and the rest are labels:

1. `applySubmitted` — the rule-4 string. Says the offer was submitted, not
   that the next charge is discounted. The most legally sensitive string here.
2. `howBody` — carries rules 1, 2 and 3 simultaneously.
3. `redeemInstructions` — has to stay true when the code shown differs from
   the code typed, which happens whenever the invitee picks the cadence the
   sharer did not reserve.
4. `shareMessage` — the only string that leaves the app, and it contains a
   live Apple offer code in plain text.
5. `capDisclosure` — PRD 10.5.7 requires the per-period limit be disclosed
   before anyone invites, so this one is required, not optional.

Still open and **not** a copy question: the refund/revoke clawback rule (what
happens to an already-applied reward when the teammate refunds) is unspecified
in the PRD and undecided.
