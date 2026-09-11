import { createServiceClient } from "../_shared/supabase.ts";
import {
  corsHeaders,
  generateRequestId,
  errorResponse,
  successResponse,
} from "../_shared/response.ts";
import { getUser } from "../_shared/auth.ts";
import { checkRateLimit } from "../_shared/ratelimit.ts";
import {
  APPLE_SUBSCRIPTION_STATUS,
  readAppleSubscription,
} from "../_shared/apple_subscription.ts";

// ---------------------------------------------------------------------------
// Referral offer — teammate share (PRD 10.5).
//
//   GET /referral/eligibility — may this user share right now, and what is
//     the state of their invites and reward?
//
// Everything here is gated on the referral_offer_enabled flag, which is OFF.
// With the flag off the endpoint still answers, but always with
// eligible = false and reason = feature_disabled, so the client has one
// consistent shape to render and the kill switch needs no client release.
//
// Eligibility is computed server-side only (PRD 10.5.3). The client never
// decides it and never marks a billing period as used.
//
// This is the "separate new endpoint" that reads Apple eligibility: the
// purchase and restore paths are deliberately left untouched. entitlements
// collapses billing retry and grace into 'active' and has never carried
// auto-renew state, so the two PRD criteria "auto-renew on" and "not in
// billing retry or grace" can only be answered by reading Apple live.
// ---------------------------------------------------------------------------

const FLAG_KEY = "referral_offer_enabled";
const DEFAULT_MAX_OPEN_INVITES = 5;

/**
 * Reasons are machine-readable state, never user-facing copy — final strings
 * are not locked (PRD 10.5.9) and must not be invented here.
 */
type Reason =
  | "feature_disabled"
  | "no_apple_subscription"
  | "trial_not_paid"
  | "not_active"
  | "no_original_transaction_id"
  | "apple_unavailable"
  | "billing_retry"
  | "billing_grace"
  | "revoked"
  | "auto_renew_off"
  | "give_slot_used"
  | "pool_unavailable";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = generateRequestId();
  const url = new URL(req.url);
  const pathMatch = url.pathname.match(/\/referral(?:\/(.+))?$/);
  const subPath = (pathMatch?.[1] ?? "").replace(/\/$/, "");

  if (subPath !== "eligibility") {
    return errorResponse(404, "NOT_FOUND", "Unknown referral path", requestId);
  }
  if (req.method !== "GET") {
    return errorResponse(405, "VALIDATION_ERROR", "Method not allowed", requestId);
  }

  return handleEligibility(req, requestId);
});

// ---------------------------------------------------------------------------
// GET /referral/eligibility
// ---------------------------------------------------------------------------

type EligibilityBody = {
  enabled: boolean;
  eligible: boolean;
  reason: Reason | null;
  cadence: "monthly" | "annual" | null;
  product_id: string | null;
  period_end: string | null;
  open_invites: number;
  max_open_invites: number;
  /** Apple allows one promotional offer at a time; 4d must not stack onto it. */
  has_active_renewal_offer: boolean;
  reward: { status: string; product_id: string; ready_at: string | null } | null;
};

function cadenceOf(productId: string | null): "monthly" | "annual" | null {
  if (!productId) return null;
  if (productId.includes("monthly")) return "monthly";
  if (productId.includes("annual")) return "annual";
  return null;
}

async function handleEligibility(req: Request, requestId: string): Promise<Response> {
  const supabase = createServiceClient();

  const auth = await getUser(req, supabase, requestId);
  if (!auth.ok) return auth.response;

  // Billing-class rather than read-class: each eligible call costs one App
  // Store Server API request, so the roomier read budget would let a single
  // client hammer Apple on our behalf.
  const rl = await checkRateLimit(auth.userId, requestId, "billing");
  if (!rl.ok) return rl.response;

  const base: EligibilityBody = {
    enabled: false,
    eligible: false,
    reason: null,
    cadence: null,
    product_id: null,
    period_end: null,
    open_invites: 0,
    max_open_invites: DEFAULT_MAX_OPEN_INVITES,
    has_active_renewal_offer: false,
    reward: null,
  };

  const deny = (reason: Reason, extra: Partial<EligibilityBody> = {}) =>
    successResponse({ ...base, ...extra, eligible: false, reason }, requestId);

  // --- kill switch ---------------------------------------------------------
  const { data: flag, error: flagErr } = await supabase
    .from("feature_flags")
    .select("enabled, metadata")
    .eq("key", FLAG_KEY)
    .maybeSingle();

  if (flagErr) {
    console.error("[referral/eligibility] flag read failed", {
      requestId,
      error: flagErr.message,
    });
    return errorResponse(500, "INTERNAL_ERROR", "Could not load configuration", requestId);
  }

  if (!flag?.enabled) return deny("feature_disabled");

  const metadata = (flag.metadata ?? {}) as Record<string, unknown>;
  const maxOpenInvites = typeof metadata.max_open_invites_per_period === "number"
    ? metadata.max_open_invites_per_period
    : DEFAULT_MAX_OPEN_INVITES;
  base.enabled = true;
  base.max_open_invites = maxOpenInvites;

  // --- Relentless-side entitlement ----------------------------------------
  const { data: ent, error: entErr } = await supabase
    .from("entitlements")
    .select("status, source, product_id, expires_at, original_transaction_id")
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (entErr) {
    console.error("[referral/eligibility] entitlement read failed", {
      requestId,
      error: entErr.message,
    });
    return errorResponse(500, "INTERNAL_ERROR", "Could not load entitlement", requestId);
  }

  // Apple-backed only: a promo grant has no Apple subscription to discount.
  // 'none' is the column default, so a user who has never purchased has a row
  // with source 'apple' — never-subscribed and promo-granted both land here.
  if (!ent || ent.source !== "apple" || ent.status === "none") {
    return deny("no_apple_subscription");
  }
  if (ent.status === "trial") return deny("trial_not_paid");
  if (ent.status !== "active") return deny("not_active");
  if (!ent.original_transaction_id) return deny("no_original_transaction_id");

  const periodEnd: string | null = ent.expires_at ?? null;
  base.product_id = ent.product_id ?? null;
  base.cadence = cadenceOf(ent.product_id ?? null);
  base.period_end = periodEnd;

  // --- reward + invite state (independent of the Apple read) ---------------
  const [invitesRes, rewardRes] = await Promise.all([
    supabase
      .from("referral_invites")
      .select("id", { count: "exact", head: true })
      .eq("sharer_original_transaction_id", ent.original_transaction_id)
      .eq("status", "open"),
    supabase
      .from("referral_rewards")
      .select("status, product_id, ready_at, period_end")
      .eq("original_transaction_id", ent.original_transaction_id)
      .eq("role", "gave")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (invitesRes.error || rewardRes.error) {
    console.error("[referral/eligibility] referral state read failed", {
      requestId,
      invitesError: invitesRes.error?.message,
      rewardError: rewardRes.error?.message,
    });
    return errorResponse(500, "INTERNAL_ERROR", "Could not load referral state", requestId);
  }

  base.open_invites = invitesRes.count ?? 0;
  if (rewardRes.data) {
    base.reward = {
      status: rewardRes.data.status,
      product_id: rewardRes.data.product_id,
      ready_at: rewardRes.data.ready_at,
    };
  }

  // --- Apple, the authority for the remaining criteria ---------------------
  const apple = await readAppleSubscription(ent.original_transaction_id);
  if (!apple.ok) {
    // Fail closed. Showing a share CTA we cannot stand behind is worse than
    // hiding it for one request.
    console.warn("[referral/eligibility] Apple read failed", {
      requestId,
      reason: apple.reason,
    });
    return deny("apple_unavailable");
  }

  const state = apple.state;
  base.has_active_renewal_offer = state.renewalOfferIdentifier !== null;

  // Cache what Apple just told us onto the columns added for exactly this
  // (PRD 10.5.10). Only the four nullable referral columns are written —
  // never status, product_id or expires_at, which drive live access.
  const { error: cacheErr } = await supabase
    .from("entitlements")
    .update({
      auto_renew_status: state.autoRenewStatus,
      renewal_product_id: state.autoRenewProductId,
      renewal_offer_identifier: state.renewalOfferIdentifier,
      renewal_offer_type: state.renewalOfferType,
    })
    .eq("user_id", auth.userId);
  if (cacheErr) {
    // Non-fatal: the decision below uses the live values either way.
    console.warn("[referral/eligibility] renewal cache write failed", {
      requestId,
      error: cacheErr.message,
    });
  }

  if (state.status === APPLE_SUBSCRIPTION_STATUS.BILLING_RETRY) return deny("billing_retry");
  if (state.status === APPLE_SUBSCRIPTION_STATUS.BILLING_GRACE) return deny("billing_grace");
  if (state.status === APPLE_SUBSCRIPTION_STATUS.REVOKED) return deny("revoked");
  if (state.status !== APPLE_SUBSCRIPTION_STATUS.ACTIVE) return deny("not_active");
  if (state.autoRenewStatus !== 1) return deny("auto_renew_off");

  // --- give slot for the current billing period ----------------------------
  // Mirrors the referral_rewards_gave_once_per_period unique index, which is
  // what actually enforces the cap; this only avoids showing a CTA that the
  // database would later refuse.
  let gaveQuery = supabase
    .from("referral_rewards")
    .select("id", { count: "exact", head: true })
    .eq("original_transaction_id", ent.original_transaction_id)
    .eq("role", "gave");
  gaveQuery = periodEnd ? gaveQuery.eq("period_end", periodEnd) : gaveQuery.is("period_end", null);

  const { count: gaveCount, error: gaveErr } = await gaveQuery;
  if (gaveErr) {
    console.error("[referral/eligibility] give-slot read failed", {
      requestId,
      error: gaveErr.message,
    });
    return errorResponse(500, "INTERNAL_ERROR", "Could not load referral state", requestId);
  }
  if ((gaveCount ?? 0) > 0) return deny("give_slot_used");

  // --- pool must actually be able to issue a code --------------------------
  // Cadence-agnostic on purpose: which SKU an invite binds is decided at
  // invite creation, not here. This only enforces PRD 10.5.7's "fail closed
  // if the pool is exhausted or a batch has not been loaded".
  const { count: poolCount, error: poolErr } = await supabase
    .from("referral_offer_codes")
    .select("id", { count: "exact", head: true })
    .eq("environment", state.environment)
    .eq("status", "available")
    .gt("apple_expires_at", new Date().toISOString());

  if (poolErr) {
    console.error("[referral/eligibility] pool read failed", {
      requestId,
      error: poolErr.message,
    });
    return errorResponse(500, "INTERNAL_ERROR", "Could not load referral state", requestId);
  }
  if ((poolCount ?? 0) === 0) return deny("pool_unavailable");

  return successResponse({ ...base, eligible: true, reason: null }, requestId);
}
