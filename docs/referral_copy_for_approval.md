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
2. ~~Say the discount covers one billing period and then returns to full
   price.~~ **Amended 2026-09-12.** The copy names the reader's actual period
   ("month" or "year") instead of the phrase "billing period", and is no
   longer required to state the return to full price — "20% off your first
   month" carries it, and Apple's redemption and confirmation screens disclose
   the real price and renewal terms before any charge.
3. Never say "this month" to someone who may be on annual. Satisfied by
   naming the real period: the eligibility response reports the sharer's
   cadence, and the invitee picks a plan before any discount copy appears.
   Where the period genuinely isn't known — the teammate hasn't chosen yet —
   the copy says "their first payment" instead.
4. Never claim the sharer's next charge is discounted **before Apple has
   accepted** the promotional offer.
5. "20% off" may only appear where the configured App Store price point is at
   least 20% below list.

Rule 5 is satisfied on all four SKUs, so the strings state 20%. See
[The 20% question](#the-20-question) for the arithmetic and the one pricing
condition it depends on.

Strings that vary by period are written below in their **monthly** form. The
annual reader sees "year" in the same slot; nothing else changes.

---

## The 20% question

**Resolved: the copy says "20% off", with no per-SKU branching.**

One string is shown on four SKUs, so rule 5 binds it to the worst of them.
With the $7.99 monthly confirmed at $6.39, all four clear the bar:

| SKU | List | Cap (0.8 × list) | Point | Actual discount |
| --- | --- | --- | --- | --- |
| `com.relentless.monthly` | $4.99 | $3.992 | $3.99 | 20.04% ✓ |
| `com.relentless.annual` | $39.99 | $31.992 | $31.99 | 20.01% ✓ |
| `com.relentless.annual.b` | $59.99 | $47.992 | $47.99 | 20.00% ✓ |
| `com.relentless.monthly.b` | $7.99 | $6.392 | $6.39 | 20.03% ✓ |

$6.39 satisfies rule 5 both ways: it is at least 20% below list, and it is at
or below the $6.392 cap, so "20% off" very slightly understates rather than
overstates. Every point is within 0.04% of an exact fifth, so no string needs
to hedge.

An earlier version of this doc recommended dropping the percentage. That was
based on not knowing the configured point and assumed the $7.99 SKU would land
at $6.49 (18.8%), which would have overstated. It does not, so the
recommendation no longer applies and the drafts below state 20%.

### The one condition attached to this

The 20% claim is only true while the price points stay where they are. It is
worth treating as a pricing constraint rather than a copy choice:

- Raising any offer point above 0.8 × list silently makes shipped copy
  overstate the discount. $6.49 on the $7.99 SKU is the specific trap, since
  it is the nearest common tier above $6.39.
- The four remaining offers should be confirmed at the points in the table
  before the flag is turned on: `SHARER20_MONTHLY`, `SHARER20_ANNUAL`,
  `SHARER20_MONTHLY_B`, `SHARER20_ANNUAL_B`. `TEAMMATE20_MONTHLY_B` at $6.39
  is confirmed; `TEAMMATE20_ANNUAL_B` should be $47.99.
- Each code file carries this list in a comment next to its strings, so
  whoever changes pricing later sees what depends on it.

---

## Surface 1 — Invitee code entry (`mobile/components/PromoCodeSheet.tsx`)

The invitee enters a code, picks a plan, and is handed the code to redeem in
Apple's sheet. Note that Apple's redemption sheet **cannot be pre-filled**, so
the code has to be shown for the user to carry across, and it is not always
the string they typed: picking the cadence the sharer didn't reserve issues
that plan's code instead. `redeemInstructions` is doing the heavy lifting
there and is the string I'd most want you to rewrite.

Tapping the code copies it and floats a "Copied" badge for about a second.
On a build without the clipboard module the tap wording drops out of
`redeemInstructions` automatically, so it never promises a tap that does
nothing; the code stays long-press selectable either way.

| Key | Draft | Notes |
| --- | --- | --- |
| `cadenceTitle` | Choose your plan | Shown after a referral code is recognized. |
| `cadenceMonthly` | Monthly | No price shown; Apple displays the discounted price in its own redemption sheet. |
| `cadenceAnnual` | Annual | |
| `cadenceBack` | Back | |
| `redeemTitle` | Redeem in the App Store | |
| `redeemInstructions` | Tap the code to copy it, then tap Continue to open Apple's Redeem Code screen and enter it there for 20% off your first month. |
| `codeCopied` | Copied | Must work even when the code shown differs from the one typed. |
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
| `howBody` | Send a teammate your invite code. When their first payment goes through, you both get 20% off — your next month, and their first payment. |
| `capDisclosure` | You can earn one reward per month. Extra teammates in the same month do not add another. |

`howBody` carries rules 1 and 3 at once: "their first payment goes through"
(not trial) for the teammate, whose plan is unknown, and "your next month" for
the reader, whose plan the server reports — so nobody on annual is shown the
word "month". `capDisclosure` satisfies PRD 10.5.7's requirement that the
per-period limit is disclosed **before** the user invites anyone.

### Sharing

| Key | Draft |
| --- | --- |
| `shareCta` | Get an invite code |
| `shareMessage` | Join me on Relentless and get 20% off your first month. Use code {CODE} when you subscribe.\n\n{APP_STORE_LINK} |

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
| `rewardReady` | Your 20% off is ready to apply. |
| `rewardApplied` | Applied. Apple has accepted your 20% off, so your next month is discounted. |
| `applyCta` | Apply my reward |
| `applySubmitted` | Sent to Apple. Once Apple confirms it, your next month is 20% off. |

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
| `ineligibleSlotUsed` | You have already earned your reward for this month. You can invite again next month. | `give_slot_used` |
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
| `popupBody` | Invite a teammate. When their first payment goes through, you both get 20% off — your next month, and their first payment. |
| `popupPrimary` | Invite a teammate |
| `popupDismiss` | Not now |

`popupBody` names the reader's own period, taken from the eligibility state
the Home trigger already fetches, so it costs no extra request.
`popupPrimary` is deliberately **not**
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
almost all of the risk, and the rest are labels. Where each one is seen:

**1. `applySubmitted`** — an alert, fired the instant the sharer taps "Apply
my reward" in Profile → Invite. The rule-4 string and the most legally
sensitive one here: at that moment Apple has only *received* the offer, so it
stays conditional ("once Apple confirms it"). `rewardApplied` is the only
string allowed to say Apple accepted, and it appears later, after the renewal
notification confirms it.

**2. `howBody`** — the explainer card at the top of the referral screen
(Profile → Invite). On screen before anyone invites. Carries rules 1 and 3
together: "their first payment" for the teammate, whose plan is unknown, and
"your next month/year" for the reader, whose plan the server reports.

**3. `redeemInstructions`** — the last pane of the promo-code sheet, directly
under the large code, after an invitee enters a code and picks a plan. Has to
stay true when the code shown differs from the code typed, which happens
whenever the invitee picks the cadence the sharer did not reserve — so it says
"this code", never "your code". Names Apple's **Redeem Code** screen (the
sheet's own title) but deliberately does not claim where the field sits on it;
that varies by iOS version. Confirm on device in the sandbox pass.

**4. `shareMessage`** — the body of the iOS share sheet when the sharer taps
share. The only string that leaves the app, and it carries a live Apple offer
code in plain text. Uses the sharer's own period, because the reserved code is
for their plan; an invitee who switches plans gets a different code and sees
the real price from Apple, so the worst case understates their discount.

**5. `capDisclosure`** — small print immediately under `howBody`, so it is
visible before anyone invites, which PRD 10.5.7 requires. Not optional.

Still open and **not** a copy question: the refund/revoke clawback rule (what
happens to an already-applied reward when the teammate refunds) is unspecified
in the PRD and undecided.
