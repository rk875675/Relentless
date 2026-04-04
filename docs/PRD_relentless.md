# Relentless — Product Requirements Document (PRD)

PRD — Relentless
Status
This PRD is the authoritative source of truth for the project.
It intentionally defines:
product direction
platform architecture
security / abuse constraints
monetization plumbing
infrastructure/schema direction
implementation workflow rules
It intentionally does not lock unnecessary low-level details that are still undecided.
When detail is not firmly decided, this PRD should:
leave it abstract
represent it as an open question
represent it as a human-step input before implementation
Do not invent missing product functionality, formulas, UX details, pricing details, content minutiae, or implementation behavior that is not explicitly defined here.
Earlier brainstorms were rough context only and do not override this document.

1. Purpose of this PRD
Relentless is a mental resilience / mental performance app for athletes.
It is not a motivation app.
Its purpose is to help athletes build a stronger competitive edge and mindset through structured mental training.
This PRD is meant to:
lock the real current app direction
preserve a strong backend / monetization / security foundation
keep architecture clear before code implementation
reduce Cursor usage by defining logic and boundaries here first
keep implementation instructions narrow and minimal-diff later

2. Product overview
Product
App name is Relentless.
Relentless is a mental resilience / mental performance app for athletes.
It is not a motivation app.
The product helps athletes build a stronger competitive edge and mindset through structured mental training.
Initial audience / scope
V1 is for track / running athletes only.
The product should expand one sport at a time later.
V1 content comes from one track-focused sports psychology / coaching partner.
Source-of-truth rule
This section reflects the actual current app direction.
Older notes or brainstorms should not override these decisions.

3. Product goals
Goals
Deliver a structured mental training experience for athletes.
Make the primary experience guided and sequential, not browse-heavy.
Establish credibility early in onboarding.
Build around expert-led mental training content.
Support premium subscription-based access from the start.
Keep content and data architecture expandable to future sports and future coaches.
Keep the system architecture strong enough for a paid app from day 1.
Non-goals
Do not position the product as generic motivation.
Do not make V1 a broad content-library product.
Do not build a marketplace in V1.
Do not define extra product functionality that is not explicitly approved.
Do not lock detailed formulas, scoring mechanics, pricing details, or offer details prematurely.

4. Core product direction
Program structure
V1 uses a fixed 30-day program.
The guided daily unit is called the Daily Workout.
Users progress through one structured program day at a time.
Core content model
Core content is made of expert-led lessons / exercises.
Every lesson is tagged to one of the three MAC categories:
Mindfulness
Acceptance
Commitment
All lessons should support:
coach voiceover
synchronized on-screen text
Lesson UI should feel consistent across content types.
Content/data architecture must support:
easy addition of new lessons
future additional coaches
future additional sports
Daily Workout
Each program day has one assigned Daily Workout.
The Daily Workout is the primary guided experience each day.
The assigned Daily Workout can be replayed unlimited times.
Repeat completions use steep diminishing returns (see §7 MAC scoring).
Library
The library tab contains 6 lessons total:
2 lessons per MAC category (Mindfulness, Acceptance, Commitment)
1 short lesson and 1 long lesson for each category
The library unlocks only after the user has completed all required Daily Workout(s) needed to be caught up, including today's.
If the user is behind, they may complete multiple missed Daily Workouts in one day until caught up.
Once caught up (all missed workouts + today's WOD completed), the library opens.
At the user's local midnight, the library locks again until they complete that day's WOD.
After completing program day 30, the library remains unlocked permanently.
Lesson structure rule
The PRD should assume lessons are structured content objects, not hardcoded one-offs.
At a minimum, lesson content architecture should support fields such as:
lesson title
lesson description
lesson time / duration
audio track / audio asset
instruction text
exercise visualization spec
journal prompt
contribution category / contribution metadata
Keep this abstract enough for schema planning.
Do not lock exact formulas or over-specify every implementation field unless later needed.

5. Core user experience
Primary experience
The app guides the user through the 30-day program one Daily Workout at a time.
The main daily CTA is to complete the current Daily Workout.
The Daily Workout flow is the primary experience in V1.
V1 should not be treated as an open browse-heavy content library product.
The library is a secondary experience that unlocks only once the user is caught up on Daily Workouts for that day.
UX direction constraints
Lesson UI should feel consistent across content types.
The product should feel guided rather than library-first.
UX/design specifics should remain intentionally abstract until explicitly decided.

6. Onboarding direction
Onboarding should:
establish credibility / proof
surface the user’s struggle(s)
introduce the MAC categories (Mindfulness, Acceptance, Commitment) at a high level
give the user a quick sample exercise
optionally capture next competition date
end in the paywall / subscription step
Onboarding rules
Competition date is optional.
Competition date should be collected in onboarding.
The paywall should appear after the onboarding / sample experience.
Do not over-specify onboarding sequence, exact copy, or final screen structure unless explicitly decided later.

7. Progression / retention
Relentless includes:
a visible mindset progress system split across the 3 MAC categories (Mindfulness, Acceptance, Commitment)
a daily streak mechanic tied to Daily Workout completion
a competition countdown tied to the user’s next competition
Progress rules
The 3 MAC rings represent current sharpness / current state, not long-term mastery.
The 3 categories are independent. There is no combined overall score.
Each ring is scored 0–100.

MAC scoring — growth
Gains are tracked per MAC category per day, not per individual lesson.
Each category has an independent daily completion count across all lessons (WOD and library) that carry that tag.
Stepped gains per category per day: 1st = +8, 2nd = +3.5, 3rd = +2.0, 4th = +1.0, 5th+ = +0.5.
Daily counts reset at midnight (UTC).
Multi-tag lessons apply gains independently to each of their categories using that category's own daily count.
This prevents farming/spam while still rewarding multiple sessions per day with diminishing returns.

MAC scoring — decay
Two decay mechanisms, both applied to all 3 rings uniformly:
1. Time-based decay: −2.0 per calendar day of inactivity (covers complete days only, through yesterday).
2. Missed-WOD penalty: −3.0 per day the scheduled Daily Workout was not completed.
Decay is evaluated lazily on each progress read or lesson completion.

MAC scoring — feel / tuning target
The system should feel like a strong but fair habit-enforcement loop.
Missing a few days causes noticeable loss (~5 points per ring per missed day).
Recovery is possible within a few good days of catch-up.
Rebuilding is not brutally slow, but losses cannot be fully erased instantly.
Tunables are centralized in `supabase/functions/_shared/scoring.ts`.

MAC scoring — visual feedback
After a lesson completion, the relevant ring(s) show a temporary green delta segment.
After app open/refresh following inactivity, the rings show a temporary red delta segment representing decay.
On tap, a short explanation shows the exact percentage gained/lost and why.
Streak rules
Streak is tied to Daily Workout completion.
Each 30-day program includes one freebie miss.
The first missed day in that 30-day program does not break the streak.
Every later missed day breaks the streak.
Every missed day after the freebie also triggers a required reflection journal.
The contents and logic of the miss reflection journal remain abstract for now.
Competition countdown
Competition countdown is in scope as a retention / context feature.
It is tied to the user’s next competition date if that exists.

8. Journal / reflection
There is no AI journal.
Journaling is required.
Journaling is text-only. Prompts are text-only.
Journaling may occur before or after the Daily Workout.
Journal storage should support entries tied to:
lessons
Daily Workouts
and/or competition context
Missed-day reflection journaling
Every missed day after the freebie triggers a required reflection journal entry.
This is separate from normal session journaling for clarity.
The contents and logic of the miss reflection journal remain abstract for now.
Do not invent AI interpretation, coaching generation, or complex journaling behavior.

8.5. Lock-in mode
The app is intended to be a low-friction, high-focus environment.
If the user backgrounds, minimizes, or leaves the app during an active session, the session is terminated.
Terminated sessions give 0 credit.
The user must fully restart the session.

9. Coach / partner model
V1 includes one content partner / coach.
The product may include a subtle outbound path to the coach for users who want deeper 1:1 help.
This should not become a major app mechanic in V1.
Content/data architecture should support future expansion across:
sports
coaching partners
Marketplace mechanics are not in scope for V1.

10. Monetization / access model
Locked monetization direction
After onboarding, the product is premium-only via subscription.
At launch, the only paid access model is subscription-based access.
Premium is the only access tier after onboarding.
Do not design a separate freemium product model for V1.
The paywall should appear after the onboarding / sample experience.
Subscription should have two purchase options, with one option including a free trial.
Support purchase restoration.
iOS monetization architecture
For iOS, use Apple In-App Purchase / StoreKit for all digital premium features unlocked in the app.
Use Superwall for paywall presentation, targeting, experiments, and purchase flow orchestration.
Do not use Stripe, web checkout, or external purchase links for iOS digital unlocks in the baseline PRD.
Do not invent final pricing, billing periods, trial length, offer structure, plan naming, or paywall copy unless explicitly provided later.
Baseline entitlement handling
Treat Superwall as the paywall and entitlement-aware layer on device.
If backend enforcement of premium access is required, sync entitlement / subscription state to backend-controlled state through verified server-side billing events, webhooks, or an equivalent verified server flow.
Any entitlement update or billing-adjacent state change must be idempotent.
The client may reflect entitlement state for UX purposes, but any backend-protected premium access must rely on backend-controlled state when applicable.
Important monetization boundary
Backend entitlement enforcement is required for any backend-served protected content, progress state, journal data, or other premium user data/actions in V1.
Do not over-specify the exact protected endpoint list yet.
Post-expiration behavior
After the free trial ends or a subscription becomes inactive, the app should be unusable for protected product usage.
Do not over-specify the exact UX yet.
At most, allow only minimal subscription-management / restore-access paths if needed.
Wording correction incorporated
This PRD no longer frames billing provider choice as open-ended.
Use this rule instead:
Final pricing structure, subscription plan design, and entitlement model details are TBD. Baseline iOS purchase path is locked to Apple IAP / StoreKit, with Superwall as the paywall layer.

11. Core architecture decisions
Baseline stack for Relentless is React Native + Expo for the iOS app, Supabase for auth/backend/database, Apple IAP / StoreKit for iOS digital subscription purchases, Superwall for paywall presentation and purchase flow orchestration, and Upstash Redis for rate limiting.
Do not change this stack unless a concrete product requirement forces a deviation and the change is explicitly approved.
Auth, backend, and database remain on Supabase unless explicitly approved otherwise.

12. Core platform principles
1) Thin client, server-authoritative backend
The client is never trusted for sensitive state.
The backend is the source of truth for:
entitlements, when backend enforcement is needed
usage counts
credits, if ever added later
quotas, if ever added later
access gates
protected feature availability
account state
audit-worthy state transitions
The client may request actions and display results, but it must not define protected state.
2) No direct client access to important third-party services
The client must not call paid, private, or abuse-sensitive third-party services directly.
Required pattern:
app calls backend
backend validates request
backend applies entitlement / quota / ownership rules
backend calls third-party dependency if allowed
backend returns only the needed response
This protects keys, enables caching, allows rate limiting, and centralizes failure handling.
3) External dependency proxy + cache
Any expensive, quota-limited, or unreliable external dependency must sit behind a backend proxy and cache layer.
Requirements:
no direct client exposure of provider keys
server-side cache for repeated reads where relevant
cache TTL based on actual feature freshness needs
graceful stale / fallback behavior when provider fails
app must not become fully unusable because one upstream service fails unless that dependency is essential to core locked functionality
4) Graceful degraded states
The system must support controlled fallback states rather than binary works / broken behavior.
Allowed high-level states may include:
normal
degraded
stale-data mode
quota-limited
temporary upstream failure
maintenance
unauthenticated
premium / non-premium
blocked / abuse-limited
Critical upstream failures must degrade predictably and safely.
5) Sensitive multi-step actions must be atomic
Any action that changes important state in more than one place must be handled as one backend-controlled operation.
Examples:
granting access
consuming quota
applying credits
restoring access
refunding
logging usage and updating counters
billing-related state changes
protected access grants / revocations
These actions should not be spread across fragile client steps.
6) Important state changes need event history
Do not only store the current value. Store the event that changed it.
This applies to:
entitlement changes
usage consumption
credits if later introduced
refunds
admin adjustments
quota resets
billing-related changes
protected access grants / revocations
This is required for debugging, abuse review, support, and future analytics.
7) Scope control is architecture
The PRD must explicitly bound:
supported surfaces
expensive operations
max query sizes
refresh frequency
quota-reset logic if later needed
what is free vs paid
what is server-computed vs client-derived
This is not just product scoping. It is architecture.
8) Known-good rollback paths
Every major change must preserve a rollback path.
Requirements:
working builds / branches remain identifiable
broad refactors should be avoided unless necessary
changes should be small and isolated
revert paths should be obvious before risky edits begin

13. Security, abuse prevention, and robustness requirements
1) Hard rate limiting on all public endpoints
All public endpoints must be rate limited.
Rate limiting must exist at multiple layers:
IP-based limits
user-based limits
endpoint-class-specific limits
tighter limits for write endpoints than read endpoints
stricter controls for auth, monetization, quota-consuming, and abuse-sensitive routes
Requirements:
limit all public endpoints, not just auth
separate read vs write lanes
separate general vs sensitive lanes
return graceful 429 responses
include stable error code and retry guidance
client must not enter infinite retry loops
logging must capture limit hits for abuse review
Numerical thresholds should be defined per endpoint group later, once endpoint inventory exists.
2) Row limits and query limits
Every list, history, search, analytics, and export endpoint must have hard bounds.
Requirements:
default page size
max page size
bounded date ranges
bounded export size
allowed sort fields only
allowed filter fields only
no unbounded scans
no user-controlled arbitrary query expansion
no large aggregation without explicit backend guardrails
3) RLS and ownership enforcement
All user-owned data must be protected with ownership enforcement at the database layer.
Requirements:
RLS enabled on user data tables
ownership policies for reads and writes
no trusting client-supplied user IDs
no direct client write path for sensitive tables
every backend read/write must respect ownership boundaries
service-role usage must stay backend-only
4) Idempotency for money, credit, and usage-affecting actions
Any endpoint that changes paid access, credits, usage, quotas, or protected state must be idempotent where applicable.
Requirements:
idempotency key support for relevant mutation endpoints
replay-safe response behavior
duplicate submission must not double-apply the action
retries from flaky networks must be safe
unique constraint or equivalent dedupe mechanism at storage layer
5) Payload limits and strict schema validation
Every endpoint must use strict validation.
Requirements:
explicit request schemas
strict unknown-field rejection
type enforcement
enum validation
length limits
payload size caps
method gating
normalized error responses
no trusting client-submitted protected values
Protected values must always be server-derived.
Examples:
access status
quota state
usage totals
entitlement flags
billing outcomes
timestamps that matter for protected logic
6) Centralized observability
The platform must have centralized visibility into failures, abuse, and billing / entitlement anomalies.
Requirements:
structured logs
request IDs
stable server error codes
audit-worthy event logs for protected actions
limit-hit logging
auth failure logging
quota-hit logging if quota-based behavior is later added
upstream failure logging
latency / error monitoring for critical endpoints
Alerting should eventually exist for:
spikes in 429s
spikes in validation failures
payment / entitlement mismatches
upstream outage patterns
repeated protected-action retries
unusual usage consumption patterns if usage-based rules are later introduced
7) Secure secret handling
No secrets may be exposed in the app bundle or client-side code.
Requirements:
secrets only in backend environment configuration
no hard-coded keys
separate environments for dev / staging / prod
rotatable keys
secret scanning in repo / process
least-privilege key usage where possible
8) TLS and secure session handling
All traffic must use TLS.
If auth / session exists, requirements include:
secure token handling
server-side session verification where applicable
safe client storage for session credentials
no insecure persistence of secrets
Exact session strategy remains implementation-specific, but secure session handling is mandatory.

14. Monetization architecture requirements
1) Backend is source of truth for paid access when backend enforcement exists
Protected feature access must be enforced server-side, not only in UI, whenever the protected action is backend-mediated.
Requirements:
premium / paid status stored in backend-controlled state when backend enforcement is needed
protected endpoints check entitlement before execution
client may hide/show UI, but backend makes the final decision for backend-protected actions
2) Usage quotas must be server-side if quotas exist
If the product later uses quotas, usage caps, credits, or plan-limited actions, all counting must happen server-side.
Requirements:
no client-side usage counting as source of truth
reset cadence defined in backend logic
quota consumption logged
over-limit response standardized
free vs paid access logic explicit
3) Paid-state changes need auditability
Any billing / entitlement state change must be reconstructable.
Requirements:
record access grants and removals
record usage-affecting adjustments
record billing-originated state transitions
preserve enough audit history for support / debugging
4) Restore behavior is required
Purchase restoration must be supported.
Restore behavior should align with Apple-compliant IAP behavior and verified entitlement state where relevant.
Do not over-specify UX or technical implementation detail here beyond that requirement.
5) Subscription-only baseline
The baseline business model is subscription-only access after onboarding.
The PRD should not assume consumables, one-time purchases, credits, or hybrid monetization unless explicitly added later.

15. Minimum infrastructure data model
These are platform entities, not final product-feature tables.
Do not finalize feature schema beyond what current product direction requires.
Required / near-required infrastructure entities
users / profiles — account identity and top-level app state
entitlements — subscription / access state for protected features where backend enforcement is needed
usage ledger — append-only record of quota or usage consumption events if such metered behavior later exists
idempotency records or equivalent dedupe mechanism — replay safety for protected mutations
audit log / protected action log — important server-side state changes
feature / config state — environment-level or rollout-level configuration
Likely-needed supporting entities
request / event logs
abuse / security event records
billing event records if webhook billing is added
admin adjustment records if support tools exist later
Product-direction-informed content entities
The system should be planned to support structured lesson content, Daily Workout progression, and journal features.
At a high level, schema planning should anticipate entities in the following areas:
lesson content objects
lesson categorization / MAC category mapping (Mindfulness, Acceptance, Commitment)
content partner / coach metadata
Daily Workout assignment and completion state
user lesson completion state
user progress state across the 3 MAC categories
streak-related user state
optional competition-date user context
journal / reflection entries tied to lesson, Daily Workout, and/or competition context
Keep this abstract enough for schema planning.
Do not over-lock formulas, field minutiae, or implementation-specific structures before the schema pass.
Explicit schema rule
Infrastructure schema can be planned first.
Product-feature schema should only be defined to the level needed by the now-approved app direction.
Do not invent extra domain objects beyond approved functionality.

16. API design constraints
API rules
every endpoint has explicit request / response schema
every endpoint has ownership rules
every endpoint has rate-limit class
every list/search endpoint has hard bounds
every protected mutation has idempotency requirements where applicable
every error response uses stable server codes
every sensitive endpoint is backend-only and never directly exposed to third-party providers
Endpoint classes
At minimum, endpoints should later be classified as:
public read
authenticated read
authenticated write
quota-consuming
entitlement-protected
admin-only
upstream-proxy / expensive dependency
This classification should drive limits and validation rules.

17. Non-functional requirements
Performance / scale
architecture must support high concurrent usage
no endpoint may rely on unbounded result sets
expensive dependencies must be cacheable where possible
backend must avoid repeated duplicate work when one cached result can serve many users
Safety
protected state must be server-controlled where relevant
abuse-sensitive routes must have stricter controls
retries must be safe
validation failures must fail closed
Operability
every critical path must be debuggable
request IDs and stable error codes are required
upstream dependency failures must be distinguishable from internal failures
Maintainability
changes should be shipped in small isolated steps
broad speculative rewrites are discouraged
rollback paths must remain obvious

18. Risks + mitigations
Risk: scaling a paid product with weak backend enforcement
Mitigation:
server-authoritative entitlements where needed
usage counting on server if metered behavior exists
idempotency
RLS
strict validation
Risk: query abuse / accidental expensive reads
Mitigation:
row caps
date-range caps
allowed sort/filter lists
bounded exports
Risk: duplicate charges or duplicate protected state changes from retries
Mitigation:
idempotent mutation design
storage-layer dedupe
replay-safe responses
Risk: upstream dependency outages
Mitigation:
backend proxy
caching
graceful degraded states
Risk: Cursor introducing broad changes that break known-good behavior
Mitigation:
architecture and logic decided here first
narrow Cursor instructions
minimal diffs
explicit “what must not change” instructions
Risk: over-specifying unfinished product details too early
Mitigation:
keep PRD abstract where detail is not locked
use open questions / human steps instead of guessed specifics

19. PRD writing rule
Abstraction / detail rule
The PRD should be specific on architecture, authority boundaries, security, monetization plumbing, data constraints, and workflow rules.
The PRD should remain intentionally abstract on low-level product or commercial details that are not yet decided.
Do not over-specify values that are better collected later as human input.
Unknown implementation-critical details should be represented as:
open questions
explicit follow-up decision points
human-step placeholders before implementation
Do not lock placeholder values into the PRD just to make it feel complete.
Examples of details that should stay out of the PRD until explicitly decided:
free trial length
final pricing
subscription cadence wording
paywall copy
offer logic details
exact grace periods
final premium feature list beyond what is already approved
onboarding sequence details
engagement mechanics beyond what is already approved
precise progress formulas
precise streak formulas
Important source-of-truth rule
Use this product direction as source of truth over older brainstorm notes.
Do not invent product features, UX, onboarding, pricing, or engagement loops that have not been explicitly defined.

20. Implementation workflow rules
ChatGPT’s role
ChatGPT is used for:
PRD writing
system architecture
schema planning
business logic design
migration / gameplan thinking
turning messy ideas into clean implementation instructions
saving Cursor usage by solving planning / logic / spec questions before code edits
helping interpret and tighten Cursor instructions before usage is spent
Cursor’s role
Cursor is used for:
scoped code implementation
editing concrete files
wiring already-decided behavior into the codebase
debugging a specific path
making minimal diffs
reverting to known-good behavior when needed
Cursor should not be used as the first place to invent architecture.
Required workflow
Define architecture / business logic here first.
Convert that into a narrow Cursor instruction.
Tell Cursor exactly what should change.
Explicitly state what should not change.
Prefer minimal diffs over broad rewrites.
Preserve known-good behavior wherever possible.
Cursor prompt rules
Prompts to Cursor should:
be narrow
define exact behavior
mention file scope when possible
ask for minimal changes
forbid unrelated refactors
preserve working functionality
ask for a concise summary of what changed
include explicit human-step questions when important low-level details are still undecided
forbid Cursor from silently filling in missing product/commercial details


20.5 Git / change-control rules
All implementation work should happen on a dedicated branch.
Before any non-trivial Cursor change, ensure the working tree is clean and the current state is committed.
Prefer small, reviewable commits scoped to one task.
Do not combine schema, auth, monetization, and UI refactors in one commit unless explicitly approved.
Before asking Cursor to edit code, identify the expected files and instruct it not to touch unrelated files.
After Cursor makes changes, review the diff before committing.
If a task is risky, create a checkpoint commit first.
Use Git as the source of truth for rollback and history.
Do not rely only on Cursor checkpoints for permanent version control.

21. PRD sequencing / gameplan
Phase 1 — platform foundation
Build first:
auth foundation
user / profile base
RLS / ownership rules
strict request validation
endpoint classification
rate limiting framework
request IDs / error envelope
infrastructure schema first
Phase 2 — endpoint inventory
Build next:
define endpoint inventory
classify endpoints by auth / sensitivity / rate-limit class
define ownership, validation, and bounds per endpoint group
Phase 3 — entitlement / usage architecture
After the core feature set is concrete enough:
define entitlement / usage architecture
define what is gated, metered, or limited
define backend entitlement sync only where needed
define protected endpoint checks
define idempotent protected mutations
define audit trail for access / usage changes
Phase 4 — external dependency hardening
Build next as needed:
provider proxy layer
cache layer
stale / fallback handling
observability around upstream failures
Phase 5 — product-specific implementation
Only after schema and core feature behavior are concrete enough:
define actual domain tables in detail
define actual endpoint behaviors
define actual quota model if any
define actual premium gates in detail
define actual notifications / engagement logic if later added

22. Open items intentionally left abstract
These should not be filled in until you explicitly decide them:
final pricing
exact subscription billing periods
free-trial length
paywall copy
exact purchase-option naming
exact onboarding sequence
precise progress scoring formula across the 3 MAC categories
precise streak formula / reset rule
exact post-expiration UX behavior
exact lesson interaction types beyond approved structured-content framing
exact backend entitlement sync implementation if backend-protected premium actions are still not concrete
exact analytics / KPIs tied to user actions
exact support / admin tooling behavior
repeat-completion / diminishing-return credit formula
decay formula, schedule, and reset behavior
detailed miss-reflection journal contents and logic

23. Human-step inputs for future implementation passes
Before implementation of monetization or product logic, require human confirmation for details such as:
free-trial duration
final subscription offerings
whether monthly / annual or other cadence is desired
exact post-trial / post-expiration access behavior
whether any backend-protected premium actions exist
exact progress scoring formula across the 3 MAC categories
exact streak reset rule
exact onboarding screen sequence
exact lesson presentation / interaction subtypes if needed by schema
exact outbound coach-link behavior
repeat-completion / diminishing-return credit formula
decay formula, schedule, and reset behavior
detailed miss-reflection journal contents and logic
Cursor should not guess these.

24. One-line carryover principles
Relentless is a mental resilience / mental performance app for athletes, not a motivation app.
V1 is track / running only, built around a fixed 30-day program with sequential Daily Workouts.
Progress is framed across the 3 MAC categories: Mindfulness, Acceptance, Commitment.
Client is untrusted for access, limits, usage, and protected state; server is source of truth where protected backend state exists.
All paid / usage-sensitive mutations must be atomic and idempotent.
Every public endpoint must have layered rate limiting.
Every list / search endpoint must enforce hard row and query bounds.
Every user-owned table must enforce ownership at the database layer.
Every endpoint must use strict schema validation and payload limits.
Critical dependency failures must degrade gracefully, not cause full downtime.
Architecture and planning happen here first so Cursor usage stays narrow and efficient.
Keep the PRD strong on system architecture and intentionally abstract on undecided fine details.


