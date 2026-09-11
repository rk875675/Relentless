# Referral offer — copy for approval

Every user-facing string in the teammate-share feature. PRD 10.5.9 says final
strings are not locked and must not be invented during implementation, so
these are **drafts for your approval**, not decisions. Nothing here ships as
final until you mark it approved.

The code currently carries these same drafts inside blocks marked
`HUMAN INPUT NEEDED`, one per surface, so replacing approved copy is a
find-and-paste into two files plus (later) the popup — never a hunt through
components.

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

A single string is shown to users on four different SKUs. Three of them have
an exact 20% point (PRD 10.5.12): $4.99 → $3.99, $39.99 → $31.99, and
$59.99 → $47.99. The **$7.99 monthly SKU has no exact 20% point**, and rule 5
caps it at **$6.39** — a $6.49 point would be 18.8% off, so copy saying "20%
off" next to it would overstate the discount.

**My recommendation: keep the percentage out of the shared strings entirely**
and say "a discount on one billing period". That is accurate on all four SKUs
regardless of what you pick from the extended price list, needs no per-SKU
copy branching, and cannot drift out of compliance if pricing changes later.
The drafts below are written that way.

If you want "20% off" in the copy for its pull, then either the $7.99 SKU's
offer must be configured at $6.39 or below, or the copy has to branch per SKU
— which is real extra work in every surface, so it's worth deciding now
rather than after approval.

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

## Surface 3 — Home popup (not built yet)

PRD 10.5.12 lists popup copy among the required inputs, so it is drafted here
to approve alongside the rest. The popup itself is the one remaining surface;
it also needs a modal-priority decision from you, which is separate from copy.

Shown after a lesson, at most twice per calendar month, only when eligible.

| Key | Draft |
| --- | --- |
| `popupTitle` | Train with a teammate |
| `popupBody` | Invite a teammate. When their first payment goes through, you each get one discounted billing period. |
| `popupPrimary` | Get an invite code |
| `popupDismiss` | Not now |

---

## How to return this

Mark each string keep / reword / replace and hand it back. I'll drop the
approved strings into the `HUMAN INPUT NEEDED` blocks and remove the
placeholder warnings. Until then the feature stays behind
`referral_offer_enabled`, which is off.

Still open and **not** a copy question: the refund/revoke clawback rule (what
happens to an already-applied reward when the teammate refunds) is unspecified
in the PRD and undecided.
