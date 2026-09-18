import { z } from "https://esm.sh/zod@3";
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
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
  type AppleEnvironment,
  isAppleCodeOrPromoOffer,
  readAppleSubscription,
} from "../_shared/apple_subscription.ts";
import { signPromotionalOffer } from "../_shared/apple_promotional_offer.ts";
import { otidClaimedByOtherUser } from "../_shared/otid_guard.ts";
import {
  REFERRAL_EVENT,
  captureReferralEvent,
  emitReferralRewardRelease,
  emitSharerRewardApplied,
} from "../_shared/referral_analytics.ts";

// ---------------------------------------------------------------------------
// Referral offer — teammate share (PRD 10.5).
//
//   GET  /referral/eligibility     — may this user share right now?
//   POST /referral/invites         — return the sharer's one share token.
//   POST /referral/claim           — invitee binds a code and gets the one to redeem.
//   POST /referral/offer-signature — mint the sharer's signed promotional offer.
//
// Everything is gated on the referral_offer_enabled flag, which is OFF. The
// read answers with eligible=false/feature_disabled so the client has one
// shape to render; the two writes refuse outright.
//
// Eligibility is computed server-side only (PRD 10.5.3). The client never
// decides it, never names a product id, and never marks a period as used.
//
// This is the "separate new endpoint" that reads Apple eligibility: the
// purchase and restore paths are deliberately left untouched. entitlements
// collapses billing retry and grace into 'active' and has never carried
// auto-renew state, so the two PRD criteria "auto-renew on" and "not in
// billing retry or grace" can only be answered by reading Apple live.
//
// Codes are live App Store discounts. They are returned to the one user
// entitled to them and are never written to a log line.
// ---------------------------------------------------------------------------

const FLAG_KEY = "referral_offer_enabled";
const DEFAULT_MAX_OPEN_INVITES = 10;
const DEFAULT_TTL_DAYS = 90;
const BUNDLE_ID = "com.relentlessmentaltoughness.relentless";

/**
 * Machine-readable state, never user-facing copy — final strings are not
 * locked (PRD 10.5.9) and must not be invented here.
 */
type Reason =
  | "feature_disabled"
  | "no_apple_subscription"
  | "trial_not_paid"
  | "not_active"
  | "no_original_transaction_id"
  | "unknown_cadence"
  | "apple_unavailable"
  | "billing_retry"
  | "billing_grace"
  | "revoked"
  | "auto_renew_off"
  | "give_slot_used"
  | "renewal_offer_active"
  | "pool_unavailable";

type Cadence = "monthly" | "annual";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = generateRequestId();
  const url = new URL(req.url);
  const pathMatch = url.pathname.match(/\/referral(?:\/(.+))?$/);
  const subPath = (pathMatch?.[1] ?? "").replace(/\/$/, "");

  switch (subPath) {
    case "config":
      if (req.method !== "GET") {
        return errorResponse(405, "VALIDATION_ERROR", "Method not allowed", requestId);
      }
      return handleConfig(req, requestId);
    case "eligibility":
      if (req.method !== "GET") {
        return errorResponse(405, "VALIDATION_ERROR", "Method not allowed", requestId);
      }
      return handleEligibility(req, requestId);
    case "invites":
      if (req.method !== "POST") {
        return errorResponse(405, "VALIDATION_ERROR", "Method not allowed", requestId);
      }
      return handleCreateInvite(req, requestId);
    case "claim":
      if (req.method !== "POST") {
        return errorResponse(405, "VALIDATION_ERROR", "Method not allowed", requestId);
      }
      return handleClaim(req, requestId);
    case "offer-signature":
      if (req.method !== "POST") {
        return errorResponse(405, "VALIDATION_ERROR", "Method not allowed", requestId);
      }
      return handleOfferSignature(req, requestId);
    case "reconcile":
      if (req.method !== "POST") {
        return errorResponse(405, "VALIDATION_ERROR", "Method not allowed", requestId);
      }
      return handleReconcile(req, requestId);
    default:
      return errorResponse(404, "NOT_FOUND", "Unknown referral path", requestId);
  }
});

// ---------------------------------------------------------------------------
// GET /referral/config — pre-auth
//
// The invitee reaches the paywall before creating an account, so the client
// has to know whether this feature is live before it has a token. /config
// cannot answer that: it requires auth. This returns the single boolean and
// nothing else — no metadata, no offer identifiers, no pool state.
// ---------------------------------------------------------------------------

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const first = fwd.split(",")[0]?.trim();
  return first && first.length > 0 ? first : "unknown";
}

/**
 * The answer is one boolean and identical for every caller, so it is cached
 * per instance. This matters because the rate-limit key below derives from
 * x-forwarded-for, which a caller can rotate to get a fresh bucket — the
 * cache means doing so buys no database work, only a cached boolean.
 */
let configCache: { enabled: boolean; at: number } | null = null;
const CONFIG_CACHE_MS = 60_000;

async function handleConfig(req: Request, requestId: string): Promise<Response> {
  // Pre-auth: rate limit by IP instead of user id, as promo-codes/validate does.
  const rl = await checkRateLimit(
    `referral-cfg-ip:${clientIp(req)}`,
    requestId,
    "authenticated-read",
  );
  if (!rl.ok) return rl.response;

  const now = Date.now();
  if (configCache && now - configCache.at < CONFIG_CACHE_MS) {
    return successResponse({ enabled: configCache.enabled }, requestId);
  }

  const supabase = createServiceClient();
  const flag = await loadFlag(supabase, requestId);
  if (!flag.ok) return flag.response;

  configCache = { enabled: flag.config.enabled, at: now };
  return successResponse({ enabled: flag.config.enabled }, requestId);
}

// ---------------------------------------------------------------------------
// Feature flag + server-side config
// ---------------------------------------------------------------------------

type FlagConfig = {
  enabled: boolean;
  maxOpenInvites: number;
  ttlDays: number;
  /** Current live SKU per cadence. Never sell legacy pricing (PRD 10.5.4). */
  liveProducts: Partial<Record<Cadence, string>>;
  /** Subscribed SKU -> the promotional offer that discounts it, legacy included. */
  sharerOffers: Record<string, string>;
};

async function loadFlag(
  supabase: SupabaseClient,
  requestId: string,
): Promise<{ ok: true; config: FlagConfig } | { ok: false; response: Response }> {
  const { data, error } = await supabase
    .from("feature_flags")
    .select("enabled, metadata")
    .eq("key", FLAG_KEY)
    .maybeSingle();

  if (error) {
    console.error("[referral] flag read failed", { requestId, error: error.message });
    return {
      ok: false,
      response: errorResponse(500, "INTERNAL_ERROR", "Could not load configuration", requestId),
    };
  }

  const metadata = (data?.metadata ?? {}) as Record<string, unknown>;
  const live = (metadata.live_products ?? {}) as Record<string, unknown>;
  const offers = (metadata.sharer_offers ?? {}) as Record<string, unknown>;

  const sharerOffers: Record<string, string> = {};
  for (const [sku, offer] of Object.entries(offers)) {
    if (typeof offer === "string" && offer.length > 0) sharerOffers[sku] = offer;
  }

  return {
    ok: true,
    config: {
      enabled: data?.enabled === true,
      maxOpenInvites: typeof metadata.max_open_invites_per_period === "number"
        ? metadata.max_open_invites_per_period
        : DEFAULT_MAX_OPEN_INVITES,
      ttlDays: typeof metadata.invite_ttl_days === "number"
        ? metadata.invite_ttl_days
        : DEFAULT_TTL_DAYS,
      liveProducts: {
        monthly: typeof live.monthly === "string" ? live.monthly : undefined,
        annual: typeof live.annual === "string" ? live.annual : undefined,
      },
      sharerOffers,
    },
  };
}

function cadenceOf(productId: string | null): Cadence | null {
  if (!productId) return null;
  if (productId.includes("monthly")) return "monthly";
  if (productId.includes("annual")) return "annual";
  return null;
}

// ---------------------------------------------------------------------------
// Shared eligibility computation (PRD 10.5.3)
//
// One implementation, used both to render the CTA state and to authorize an
// invite. The write path must never trust a decision the read path made
// earlier on the client's behalf.
// ---------------------------------------------------------------------------

type EligibilityFacts = {
  originalTransactionId: string;
  productId: string | null;
  periodEnd: string | null;
  cadence: Cadence | null;
  environment: AppleEnvironment | null;
  hasActiveRenewalOffer: boolean;
  openInvites: number;
  reward: { status: string; product_id: string; ready_at: string | null; invite_id: string | null } | null;
};

type EligibilityOutcome =
  | { kind: "eligible"; facts: EligibilityFacts & { environment: AppleEnvironment } }
  | { kind: "denied"; reason: Reason; facts: Partial<EligibilityFacts> }
  | { kind: "error"; response: Response };

async function computeEligibility(
  supabase: SupabaseClient,
  userId: string,
  config: FlagConfig,
  requestId: string,
): Promise<EligibilityOutcome> {
  const fail = (reason: Reason, facts: Partial<EligibilityFacts> = {}): EligibilityOutcome => ({
    kind: "denied",
    reason,
    facts,
  });
  const oops = (msg: string): EligibilityOutcome => ({
    kind: "error",
    response: errorResponse(500, "INTERNAL_ERROR", msg, requestId),
  });

  const { data: ent, error: entErr } = await supabase
    .from("entitlements")
    .select("status, source, product_id, expires_at, original_transaction_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (entErr) {
    console.error("[referral] entitlement read failed", { requestId, error: entErr.message });
    return oops("Could not load entitlement");
  }

  // Apple-backed only: a promo grant has no Apple subscription to discount.
  // 'none' is the column default, so a user who has never purchased has a row
  // with source 'apple' — never-subscribed and promo-granted both land here.
  if (!ent || ent.source !== "apple" || ent.status === "none") {
    return fail("no_apple_subscription");
  }
  if (!ent.original_transaction_id) return fail("no_original_transaction_id");

  const otid: string = ent.original_transaction_id;
  const periodEnd: string | null = ent.expires_at ?? null;
  const cadence = cadenceOf(ent.product_id ?? null);

  const partial: Partial<EligibilityFacts> = {
    originalTransactionId: otid,
    productId: ent.product_id ?? null,
    periodEnd,
    cadence,
  };

  // Look up the sharer's earned reward and invites BEFORE status checks so
  // that a lapsed or trial subscriber can still see (and apply) a reward they
  // already earned. Without this, a sharer whose subscription expires before
  // they tap Apply would silently lose their earned discount.
  let usesQuery = supabase
    .from("referral_invites")
    .select("id", { count: "exact", head: true })
    .eq("sharer_original_transaction_id", otid)
    .in("status", ["open", "claimed", "converted"]);
  usesQuery = periodEnd
    ? usesQuery.eq("sharer_period_end", periodEnd)
    : usesQuery.is("sharer_period_end", null);

  const [invitesRes, rewardRes] = await Promise.all([
    usesQuery,
    supabase
      .from("referral_rewards")
      .select("status, product_id, ready_at, invite_id")
      .eq("original_transaction_id", otid)
      .eq("role", "gave")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (invitesRes.error || rewardRes.error) {
    console.error("[referral] referral state read failed", {
      requestId,
      invitesError: invitesRes.error?.message,
      rewardError: rewardRes.error?.message,
    });
    return oops("Could not load referral state");
  }

  partial.openInvites = invitesRes.count ?? 0;
  partial.reward = rewardRes.data
    ? {
      status: rewardRes.data.status,
      product_id: rewardRes.data.product_id,
      ready_at: rewardRes.data.ready_at,
      invite_id: rewardRes.data.invite_id,
    }
    : null;

  // Status gates: expired / revoked local rows cannot CREATE new invites, but
  // can still see + apply an already-earned reward (included in partial above).
  // Relentless creator promo grants already failed above (source !== apple).
  // Apple offer-code / promotional free months are still source=apple + trial
  // locally — those are decided after the live Apple read, so we do not fail
  // trial here.
  if (ent.status !== "active" && ent.status !== "trial") {
    return fail("not_active", partial);
  }

  // Without a cadence we cannot pick which SKU the invitee is sold, and
  // guessing would risk selling the wrong plan.
  if (!cadence) return fail("unknown_cadence", partial);

  // --- Apple, the authority for the remaining criteria ---------------------
  const apple = await readAppleSubscription(otid);
  if (!apple.ok) {
    // Fail closed. Showing a share CTA we cannot stand behind is worse than
    // hiding it for one request.
    console.warn("[referral] Apple read failed", { requestId, reason: apple.reason });
    return fail("apple_unavailable", partial);
  }

  const state = apple.state;
  partial.environment = state.environment;
  partial.hasActiveRenewalOffer = state.renewalOfferIdentifier !== null;

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
    .eq("user_id", userId);
  if (cacheErr) {
    // Non-fatal: the decision below uses the live values either way.
    console.warn("[referral] renewal cache write failed", { requestId, error: cacheErr.message });
  }

  if (state.status === APPLE_SUBSCRIPTION_STATUS.BILLING_RETRY) {
    return fail("billing_retry", partial);
  }
  if (state.status === APPLE_SUBSCRIPTION_STATUS.BILLING_GRACE) {
    return fail("billing_grace", partial);
  }
  if (state.status === APPLE_SUBSCRIPTION_STATUS.REVOKED) return fail("revoked", partial);
  if (state.status !== APPLE_SUBSCRIPTION_STATUS.ACTIVE) return fail("not_active", partial);
  if (state.autoRenewStatus !== 1) return fail("auto_renew_off", partial);

  // Superwall / product intro trials (offerType 1) stay blocked. Apple
  // offer-code and promotional free months (types 3 and 2) have a card on
  // file, so they may share. Trust Apple's current transaction over a stale
  // entitlements.trial row — if Apple says this period is paid, treat it as paid.
  if (state.isTrialPeriod && !isAppleCodeOrPromoOffer(state.transactionOfferType)) {
    return fail("trial_not_paid", partial);
  }

  // --- give slot for the current billing period ----------------------------
  // Mirrors the referral_rewards_gave_once_per_period unique index, which is
  // what actually enforces the cap; this only avoids offering a share the
  // database would later refuse.
  let gaveQuery = supabase
    .from("referral_rewards")
    .select("id", { count: "exact", head: true })
    .eq("original_transaction_id", otid)
    .eq("role", "gave");
  gaveQuery = periodEnd ? gaveQuery.eq("period_end", periodEnd) : gaveQuery.is("period_end", null);

  const { count: gaveCount, error: gaveErr } = await gaveQuery;
  if (gaveErr) {
    console.error("[referral] give-slot read failed", { requestId, error: gaveErr.message });
    return oops("Could not load referral state");
  }
  if ((gaveCount ?? 0) > 0) return fail("give_slot_used", partial);

  // Apple will not stack a second offer on the next renewal. Promising 20%
  // off — or letting them invite — would be a lie until that offer is used.
  if (state.renewalOfferIdentifier) {
    return fail("renewal_offer_active", partial);
  }

  // --- the pool must actually be able to issue a code ----------------------
  // PRD 10.5.7: if the pool is exhausted or a batch has not been loaded,
  // sharing fails closed. Scoped to the SKU this sharer's invitee would be
  // sold, so a drained monthly pool cannot advertise a share that dies on
  // creation.
  const inviteeProduct = config.liveProducts[cadence];
  if (!inviteeProduct) {
    console.error("[referral] live_products missing a cadence", { requestId, cadence });
    return oops("Referral products are not configured");
  }

  const { count: poolCount, error: poolErr } = await supabase
    .from("referral_offer_codes")
    .select("id", { count: "exact", head: true })
    .eq("environment", state.environment)
    .eq("product_id", inviteeProduct)
    .eq("status", "available")
    .gt("apple_expires_at", new Date().toISOString());

  if (poolErr) {
    console.error("[referral] pool read failed", { requestId, error: poolErr.message });
    return oops("Could not load referral state");
  }
  if ((poolCount ?? 0) === 0) return fail("pool_unavailable", partial);

  return {
    kind: "eligible",
    facts: {
      originalTransactionId: otid,
      productId: ent.product_id ?? null,
      periodEnd,
      cadence,
      environment: state.environment,
      hasActiveRenewalOffer: partial.hasActiveRenewalOffer ?? false,
      openInvites: partial.openInvites ?? 0,
      reward: partial.reward ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// GET /referral/eligibility
// ---------------------------------------------------------------------------

async function handleEligibility(req: Request, requestId: string): Promise<Response> {
  const supabase = createServiceClient();

  const auth = await getUser(req, supabase, requestId);
  if (!auth.ok) return auth.response;

  // Billing-class rather than read-class: each call costs one App Store
  // Server API request, so the roomier read budget would let a single client
  // hammer Apple on our behalf.
  const rl = await checkRateLimit(auth.userId, requestId, "billing");
  if (!rl.ok) return rl.response;

  const flag = await loadFlag(supabase, requestId);
  if (!flag.ok) return flag.response;

  const body = {
    enabled: flag.config.enabled,
    eligible: false,
    reason: null as Reason | null,
    cadence: null as Cadence | null,
    product_id: null as string | null,
    period_end: null as string | null,
    open_invites: 0,
    max_open_invites: flag.config.maxOpenInvites,
    invite_ttl_days: flag.config.ttlDays,
    has_active_renewal_offer: false,
    share_code: null as string | null,
    reward: null as EligibilityFacts["reward"],
    invites: [] as InviteSummary[],
  };

  if (!flag.config.enabled) {
    return successResponse({ ...body, enabled: false, reason: "feature_disabled" }, requestId);
  }

  const outcome = await computeEligibility(supabase, auth.userId, flag.config, requestId);
  if (outcome.kind === "error") return outcome.response;

  const facts = outcome.facts;
  const reason = outcome.kind === "eligible" ? null : outcome.reason;
  const canMintShareCode =
    !!facts.originalTransactionId &&
    !!facts.environment &&
    reason !== "trial_not_paid" &&
    reason !== "no_apple_subscription" &&
    reason !== "no_original_transaction_id" &&
    reason !== "renewal_offer_active";

  let shareCode: string | null = null;
  if (canMintShareCode) {
    shareCode = await ensureShareCode(
      supabase,
      auth.userId,
      facts.originalTransactionId!,
      facts.environment!,
      requestId,
    );
  }

  return successResponse({
    ...body,
    eligible: outcome.kind === "eligible",
    reason,
    cadence: facts.cadence ?? null,
    product_id: facts.productId ?? null,
    period_end: facts.periodEnd ?? null,
    open_invites: facts.openInvites ?? 0,
    has_active_renewal_offer: facts.hasActiveRenewalOffer ?? false,
    share_code: shareCode,
    reward: facts.reward ?? null,
    invites: await loadInvites(supabase, auth.userId, requestId),
  }, requestId);
}

type EnsureShareRpc = { result: "ok" | "unavailable" | "invalid_environment"; code?: string };

async function lookupShareEnvironment(
  supabase: SupabaseClient,
  code: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("referral_share_tokens")
    .select("environment")
    .eq("code", code)
    .maybeSingle();
  return typeof data?.environment === "string" ? data.environment : null;
}

async function ensureShareCode(
  supabase: SupabaseClient,
  userId: string,
  originalTransactionId: string,
  environment: AppleEnvironment,
  requestId: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("ensure_referral_share_token", {
    p_user_id: userId,
    p_original_transaction_id: originalTransactionId,
    p_environment: environment,
  });
  if (error) {
    console.error("[referral] share token ensure failed", { requestId, error: error.message });
    return null;
  }
  const result = (data ?? {}) as EnsureShareRpc;
  if (result.result === "ok" && result.code) {
    await captureReferralEvent(
      userId,
      REFERRAL_EVENT.SHARE_CODE_READY,
      {
        share_code: result.code,
        original_transaction_id: originalTransactionId,
        environment,
      },
      `referral_share_code_ready:${userId}:${result.code}`,
    );
    return result.code;
  }
  return null;
}

type InviteSummary = {
  id: string;
  status: string;
  /**
   * Present only while the invite is still open. Once claimed, the code is
   * bound to that invitee and re-sharing it does nothing, so handing it back
   * would only invite confusion.
   */
  code: string | null;
  invitee_product_id: string;
  created_at: string;
  ttl_expires_at: string;
  claimed_at: string | null;
  converted_at: string | null;
};

/**
 * The sharer's own invites, so the share surface can re-share an invite that
 * already exists. Without this the UI can only create, and every visit to the
 * share screen would consume another code from a finite pool.
 */
async function loadInvites(
  supabase: SupabaseClient,
  userId: string,
  requestId: string,
): Promise<InviteSummary[]> {
  const { data, error } = await supabase
    .from("referral_invites")
    .select(
      "id, status, created_at, ttl_expires_at, claimed_at, converted_at, invitee_product_id, " +
        "code:referral_offer_codes!referral_invites_code_id_fkey(code)",
    )
    .eq("sharer_user_id", userId)
    .in("status", ["claimed", "converted"])
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    // A failure here costs the invite list, not the eligibility answer.
    console.error("[referral] invite list read failed", { requestId, error: error.message });
    return [];
  }

  // The generated types cannot describe an embed with an explicit FK hint,
  // which is required here because referral_invites has three foreign keys
  // into referral_offer_codes.
  type Row = Omit<InviteSummary, "code"> & {
    code: { code?: string } | { code?: string }[] | null;
  };

  return ((data ?? []) as unknown as Row[]).map((row) => {
    const code = Array.isArray(row.code) ? row.code[0]?.code : row.code?.code;
    return {
      id: row.id,
      status: row.status,
      code: row.status === "open" ? (code ?? null) : null,
      invitee_product_id: row.invitee_product_id,
      created_at: row.created_at,
      ttl_expires_at: row.ttl_expires_at,
      claimed_at: row.claimed_at,
      converted_at: row.converted_at,
    };
  });
}

// ---------------------------------------------------------------------------
// POST /referral/invites
// ---------------------------------------------------------------------------

async function handleCreateInvite(req: Request, requestId: string): Promise<Response> {
  const supabase = createServiceClient();

  const auth = await getUser(req, supabase, requestId);
  if (!auth.ok) return auth.response;

  const rl = await checkRateLimit(auth.userId, requestId, "billing");
  if (!rl.ok) return rl.response;

  const flag = await loadFlag(supabase, requestId);
  if (!flag.ok) return flag.response;
  if (!flag.config.enabled) {
    return errorResponse(403, "FEATURE_DISABLED", "Referral sharing is not available", requestId);
  }

  const outcome = await computeEligibility(supabase, auth.userId, flag.config, requestId);
  if (outcome.kind === "error") return outcome.response;
  if (outcome.kind === "denied") {
    await captureReferralEvent(auth.userId, REFERRAL_EVENT.SHARE_REQUEST_FAILED, {
      reason: outcome.reason,
      cadence: outcome.facts.cadence ?? null,
      product_id: outcome.facts.productId ?? null,
    });
    return errorResponse(403, "NOT_ELIGIBLE", `Not eligible to share (${outcome.reason})`, requestId);
  }

  const facts = outcome.facts;
  const shareCode = await ensureShareCode(
    supabase,
    auth.userId,
    facts.originalTransactionId,
    facts.environment,
    requestId,
  );
  if (!shareCode) {
    await captureReferralEvent(auth.userId, REFERRAL_EVENT.SHARE_REQUEST_FAILED, {
      reason: "pool_unavailable",
      cadence: facts.cadence,
      product_id: facts.productId,
      environment: facts.environment,
    });
    return errorResponse(503, "POOL_UNAVAILABLE", "Sharing is temporarily unavailable", requestId);
  }

  return successResponse({
    code: shareCode,
    product_id: facts.productId,
    open_invites: facts.openInvites ?? 0,
    max_open_invites: flag.config.maxOpenInvites,
  }, requestId);
}

// ---------------------------------------------------------------------------
// POST /referral/claim
//
// The invitee names a CADENCE, never a product id: the server owns the
// cadence -> live SKU mapping so a client can never ask to be sold legacy
// pricing or another plan's code.
// ---------------------------------------------------------------------------

const ClaimSchema = z.object({
  code: z.string().trim().min(1).max(64),
  cadence: z.enum(["monthly", "annual"]),
}).strict();

type ClaimRpc = {
  result:
    | "claimed"
    | "invalid"
    | "self_share"
    | "reciprocity_blocked"
    | "already_received"
    | "pool_empty";
  replay?: boolean;
  invite_id?: string;
  code?: string;
  product_id?: string;
  apple_expires_at?: string;
};

async function handleClaim(req: Request, requestId: string): Promise<Response> {
  const supabase = createServiceClient();

  const auth = await getUser(req, supabase, requestId);
  if (!auth.ok) return auth.response;

  const rl = await checkRateLimit(auth.userId, requestId, "billing");
  if (!rl.ok) return rl.response;

  const flag = await loadFlag(supabase, requestId);
  if (!flag.ok) return flag.response;
  if (!flag.config.enabled) {
    return errorResponse(403, "FEATURE_DISABLED", "Referral codes are not available", requestId);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorResponse(400, "VALIDATION_ERROR", "Invalid JSON body", requestId);
  }
  const parsed = ClaimSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path?.length ? `${issue.path.join(".")}: ` : "";
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      `${where}${issue?.message ?? "Invalid request body"}`,
      requestId,
    );
  }

  const targetProduct = flag.config.liveProducts[parsed.data.cadence];
  if (!targetProduct) {
    console.error("[referral/claim] live_products missing a cadence", {
      requestId,
      cadence: parsed.data.cadence,
    });
    return errorResponse(500, "INTERNAL_ERROR", "Referral products are not configured", requestId);
  }

  const shareEnvironment = await lookupShareEnvironment(supabase, parsed.data.code);
  const claimBase = {
    cadence: parsed.data.cadence,
    product_id: targetProduct,
    share_code: parsed.data.code,
    environment: shareEnvironment,
  };

  const { data, error } = await supabase.rpc("claim_referral_code", {
    p_code: parsed.data.code,
    p_user_id: auth.userId,
    p_target_product_id: targetProduct,
  });

  if (error) {
    console.error("[referral/claim] rpc failed", { requestId, error: error.message });
    await captureReferralEvent(auth.userId, REFERRAL_EVENT.CLAIM_FAILED, {
      reason: "rpc_error",
      ...claimBase,
    });
    return errorResponse(500, "INTERNAL_ERROR", "Could not claim code", requestId);
  }

  const result = (data ?? {}) as ClaimRpc;

  switch (result.result) {
    case "invalid":
      // Same answer for unknown, lapsed, exhausted and wrong-type codes, so
      // the response never reveals which code system was probed (PRD 10.5.7).
      await captureReferralEvent(auth.userId, REFERRAL_EVENT.CLAIM_FAILED, {
        reason: "invalid",
        ...claimBase,
      });
      return errorResponse(404, "INVALID_CODE", "This code is not valid", requestId);
    case "self_share":
      await captureReferralEvent(auth.userId, REFERRAL_EVENT.CLAIM_FAILED, {
        reason: "self_share",
        ...claimBase,
      });
      return errorResponse(409, "SELF_SHARE", "You cannot redeem your own invite", requestId);
    case "reciprocity_blocked":
      await captureReferralEvent(auth.userId, REFERRAL_EVENT.CLAIM_FAILED, {
        reason: "reciprocity_blocked",
        ...claimBase,
      });
      return errorResponse(
        409,
        "RECIPROCITY_BLOCKED",
        "You cannot redeem an invite from someone you already invited",
        requestId,
      );
    case "already_received":
      await captureReferralEvent(auth.userId, REFERRAL_EVENT.CLAIM_FAILED, {
        reason: "already_received",
        ...claimBase,
      });
      return errorResponse(
        409,
        "ALREADY_RECEIVED",
        "This Apple account has already used a referral offer",
        requestId,
      );
    case "pool_empty":
      await captureReferralEvent(auth.userId, REFERRAL_EVENT.CLAIM_FAILED, {
        reason: "pool_empty",
        ...claimBase,
      });
      return errorResponse(503, "POOL_UNAVAILABLE", "This offer is temporarily unavailable", requestId);
    case "claimed":
      console.log("[referral/claim] code claimed", {
        requestId,
        invite_id: result.invite_id,
        product_id: result.product_id,
        replay: result.replay === true,
      });
      await captureReferralEvent(
        auth.userId,
        REFERRAL_EVENT.CLAIM_SUCCEEDED,
        {
          ...claimBase,
          invite_id: result.invite_id ?? null,
          product_id: result.product_id ?? targetProduct,
          replay: result.replay === true,
        },
        result.invite_id
          ? `referral_claim:${result.invite_id}:${auth.userId}`
          : undefined,
      );
      return successResponse({
        claimed: true,
        replay: result.replay === true,
        code: result.code,
        product_id: result.product_id,
        apple_expires_at: result.apple_expires_at,
      }, requestId);
    default:
      console.error("[referral/claim] unexpected rpc result", { requestId, result: result.result });
      await captureReferralEvent(auth.userId, REFERRAL_EVENT.CLAIM_FAILED, {
        reason: "unexpected_result",
        ...claimBase,
      });
      return errorResponse(500, "INTERNAL_ERROR", "Could not claim code", requestId);
  }
}

// ---------------------------------------------------------------------------
// POST /referral/offer-signature
//
// The sharer's half of the reward. Apple validates the signature against the
// exact parameters the app then sends, so the server picks every one of them:
// the client names nothing and the In-App Purchase key never leaves here
// (PRD 10.5.2).
//
// Minting a signature is not the same as applying the offer. The sharer may
// never complete the purchase, so the reward only becomes 'applied' when
// Apple reports the offer on their next renewal, which the notification
// handler confirms.
// ---------------------------------------------------------------------------

async function handleOfferSignature(req: Request, requestId: string): Promise<Response> {
  const supabase = createServiceClient();

  const auth = await getUser(req, supabase, requestId);
  if (!auth.ok) return auth.response;

  const rl = await checkRateLimit(auth.userId, requestId, "billing");
  if (!rl.ok) return rl.response;

  const flag = await loadFlag(supabase, requestId);
  if (!flag.ok) return flag.response;
  if (!flag.config.enabled) {
    return errorResponse(403, "FEATURE_DISABLED", "Referral rewards are not available", requestId);
  }

  const { data: ent, error: entErr } = await supabase
    .from("entitlements")
    .select("product_id, original_transaction_id")
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (entErr) {
    console.error("[referral/offer-signature] entitlement read failed", {
      requestId,
      error: entErr.message,
    });
    return errorResponse(500, "INTERNAL_ERROR", "Could not load entitlement", requestId);
  }
  if (!ent?.original_transaction_id) {
    await captureReferralEvent(auth.userId, REFERRAL_EVENT.SHARER_OFFER_SIGN_FAILED, {
      reason: "no_original_transaction_id",
    });
    return errorResponse(403, "NOT_ELIGIBLE", "No Apple subscription to discount", requestId);
  }

  const { data: reward, error: rewardErr } = await supabase
    .from("referral_rewards")
    .select("id, product_id, offer_identifier, status")
    .eq("user_id", auth.userId)
    .eq("role", "gave")
    .in("status", ["ready", "applied"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (rewardErr) {
    console.error("[referral/offer-signature] reward read failed", {
      requestId,
      error: rewardErr.message,
    });
    return errorResponse(500, "INTERNAL_ERROR", "Could not load reward", requestId);
  }
  if (!reward) {
    await captureReferralEvent(auth.userId, REFERRAL_EVENT.SHARER_OFFER_SIGN_FAILED, {
      reason: "no_reward_ready",
      original_transaction_id: ent.original_transaction_id,
    });
    return errorResponse(404, "NO_REWARD_READY", "No referral reward is ready", requestId);
  }
  if (reward.status === "applied") {
    return errorResponse(409, "ALREADY_APPLIED", "This reward has already been applied", requestId);
  }

  // Apple decides whether this subscription can take an offer at all.
  const apple = await readAppleSubscription(ent.original_transaction_id);
  if (!apple.ok) {
    console.warn("[referral/offer-signature] Apple read failed", {
      requestId,
      reason: apple.reason,
    });
    await captureReferralEvent(auth.userId, REFERRAL_EVENT.SHARER_OFFER_SIGN_FAILED, {
      reason: "apple_unavailable",
      reward_id: reward.id,
      original_transaction_id: ent.original_transaction_id,
    });
    return errorResponse(503, "APPLE_UNAVAILABLE", "Could not reach the App Store", requestId);
  }

  const state = apple.state;
  if (state.status !== APPLE_SUBSCRIPTION_STATUS.ACTIVE) {
    await captureReferralEvent(auth.userId, REFERRAL_EVENT.SHARER_OFFER_SIGN_FAILED, {
      reason: "subscription_not_active",
      reward_id: reward.id,
      original_transaction_id: ent.original_transaction_id,
      environment: state.environment,
    });
    return errorResponse(409, "SUBSCRIPTION_NOT_ACTIVE", "Subscription is not active", requestId);
  }
  // A promotional offer takes effect at the next billing event. With
  // auto-renew off there is no next billing event for it to discount.
  if (state.autoRenewStatus !== 1) {
    await captureReferralEvent(auth.userId, REFERRAL_EVENT.SHARER_OFFER_SIGN_FAILED, {
      reason: "auto_renew_off",
      reward_id: reward.id,
      original_transaction_id: ent.original_transaction_id,
      environment: state.environment,
    });
    return errorResponse(409, "AUTO_RENEW_OFF", "Subscription is set to not renew", requestId);
  }

  // Sign for the product that will actually RENEW, not the one currently
  // active: a subscriber who has switched plans renews onto a different SKU,
  // and Apple only applies a same-product promotional offer.
  const renewProduct = state.autoRenewProductId ?? state.productId ?? ent.product_id;
  if (!renewProduct) {
    await captureReferralEvent(auth.userId, REFERRAL_EVENT.SHARER_OFFER_SIGN_FAILED, {
      reason: "unknown_product",
      reward_id: reward.id,
      original_transaction_id: ent.original_transaction_id,
      environment: state.environment,
    });
    return errorResponse(409, "UNKNOWN_PRODUCT", "Could not determine the renewing product", requestId);
  }

  const offerIdentifier = flag.config.sharerOffers[renewProduct];
  if (!offerIdentifier) {
    console.error("[referral/offer-signature] no promotional offer configured for SKU", {
      requestId,
      renewProduct,
    });
    await captureReferralEvent(auth.userId, REFERRAL_EVENT.SHARER_OFFER_SIGN_FAILED, {
      reason: "no_offer_for_sku",
      reward_id: reward.id,
      product_id: renewProduct,
      original_transaction_id: ent.original_transaction_id,
      environment: state.environment,
    });
    return errorResponse(
      409,
      "NO_OFFER_FOR_SKU",
      "No offer is available for this subscription",
      requestId,
    );
  }

  // Apple permits one active promotional offer at a time (PRD 10.5.7).
  if (state.renewalOfferIdentifier) {
    if (state.renewalOfferIdentifier === offerIdentifier) {
      // Already attached: record it rather than handing out another signature.
      const { error: confirmErr } = await supabase.rpc("confirm_sharer_offer_applied", {
        p_original_transaction_id: ent.original_transaction_id,
        p_offer_identifier: offerIdentifier,
      });
      if (confirmErr) {
        console.error("[referral/offer-signature] confirm failed", {
          requestId,
          error: confirmErr.message,
        });
      }
      await emitSharerRewardApplied({
        distinctId: auth.userId,
        rpc: confirmErr ? null : { result: "already_applied", reward_id: reward.id },
        rpcError: confirmErr?.message ?? null,
        source: "offer_signature",
        originalTransactionId: ent.original_transaction_id,
        offerIdentifier,
        environment: state.environment,
      });
      return errorResponse(409, "ALREADY_APPLIED", "This reward is already applied", requestId);
    }
    await captureReferralEvent(auth.userId, REFERRAL_EVENT.SHARER_OFFER_SIGN_FAILED, {
      reason: "offer_already_active",
      reward_id: reward.id,
      product_id: renewProduct,
      original_transaction_id: ent.original_transaction_id,
      environment: state.environment,
    });
    return errorResponse(
      409,
      "OFFER_ALREADY_ACTIVE",
      "Another offer is already attached to your next renewal",
      requestId,
    );
  }

  // Keep the reward row describing what we are actually signing, in case the
  // sharer changed plans between earning and applying.
  if (reward.product_id !== renewProduct || reward.offer_identifier !== offerIdentifier) {
    const { error: syncErr } = await supabase
      .from("referral_rewards")
      .update({ product_id: renewProduct, offer_identifier: offerIdentifier })
      .eq("id", reward.id);
    if (syncErr) {
      console.warn("[referral/offer-signature] could not re-point reward to the renewing SKU", {
        requestId,
        error: syncErr.message,
      });
    }
  }

  const signed = await signPromotionalOffer(
    BUNDLE_ID,
    renewProduct,
    offerIdentifier,
    auth.userId,
  );
  if (!signed.ok) {
    await captureReferralEvent(auth.userId, REFERRAL_EVENT.SHARER_OFFER_SIGN_FAILED, {
      reason: signed.reason === "not_configured" ? "not_configured" : "sign_failed",
      reward_id: reward.id,
      product_id: renewProduct,
      offer_identifier: offerIdentifier,
      original_transaction_id: ent.original_transaction_id,
      environment: state.environment,
    });
    return errorResponse(
      signed.reason === "not_configured" ? 503 : 500,
      "INTERNAL_ERROR",
      "Could not sign the offer",
      requestId,
    );
  }

  // The signature itself is deliberately absent from the log line: it
  // authorizes a discounted charge.
  console.log("[referral/offer-signature] signed", {
    requestId,
    reward_id: reward.id,
    product_id: renewProduct,
    offer_identifier: offerIdentifier,
  });
  await captureReferralEvent(
    auth.userId,
    REFERRAL_EVENT.SHARER_OFFER_SIGNED,
    {
      reward_id: reward.id,
      product_id: renewProduct,
      offer_identifier: offerIdentifier,
      original_transaction_id: ent.original_transaction_id,
      environment: state.environment,
    },
    `referral_sharer_signed:${reward.id}`,
  );

  return successResponse({
    reward_id: reward.id,
    product_id: signed.signature.productId,
    offer_identifier: signed.signature.offerIdentifier,
    key_identifier: signed.signature.keyIdentifier,
    nonce: signed.signature.nonce,
    timestamp: signed.signature.timestamp,
    signature: signed.signature.signature,
    // Folded into the signature, so the purchase must send exactly this.
    app_account_token: signed.signature.appAccountToken,
  }, requestId);
}

// ---------------------------------------------------------------------------
// POST /referral/reconcile
//
// Called from the syncing overlay after an offer-code purchase. The client
// cannot reliably determine the correct original_transaction_id from StoreKit
// (sandbox shares purchases across accounts on the same device), so this
// endpoint resolves it server-side:
//
//   1. Find the user's claimed invite.
//   2. Look up the apple_notification_log for a SUBSCRIBED offerType=3
//      notification whose offer_identifier matches the invite's code.
//   3. Use that OTID to verify with Apple and update the entitlement.
//   4. Fire release_referral_reward.
//
// Idempotent: safe to poll repeatedly.
// ---------------------------------------------------------------------------

async function handleReconcile(
  req: Request,
  requestId: string,
): Promise<Response> {
  const supabase = createServiceClient();

  const auth = await getUser(req, supabase, requestId);
  if (!auth.ok) return auth.response;

  const rl = await checkRateLimit(
    `referral-reconcile:${auth.userId}`,
    requestId,
    "authenticated-read",
  );
  if (!rl.ok) return rl.response;

  // Find this user's most recent claimed invite.
  const { data: invite } = await supabase
    .from("referral_invites")
    .select("id, code_id, issued_code_id, status, claimed_at")
    .eq("claimed_by_user_id", auth.userId)
    .in("status", ["claimed", "converted"])
    .order("claimed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!invite) {
    return successResponse({ reconciled: false, reason: "no_invite" }, requestId);
  }

  // Get the offer_reference_name from the code to match the notification.
  const codeId = invite.issued_code_id ?? invite.code_id;
  const { data: codeRow } = await supabase
    .from("referral_offer_codes")
    .select("offer_reference_name")
    .eq("id", codeId)
    .maybeSingle();

  if (!codeRow?.offer_reference_name) {
    await captureReferralEvent(auth.userId, REFERRAL_EVENT.RECONCILE_FAILED, {
      reason: "no_code",
      invite_id: invite.id,
    });
    return successResponse({ reconciled: false, reason: "no_code" }, requestId);
  }

  // Apple only reports the batch offer name, so we cannot key on the code
  // string. Restrict to notifications after THIS claim so we do not attach
  // yesterday's (or another teammate's) TEAMMATE20_* purchase. Skip any
  // OTID already owned by a different Relentless user.
  const claimedAtMs = invite.claimed_at ? new Date(invite.claimed_at).getTime() : Date.now();
  const since = new Date(claimedAtMs - 120_000).toISOString();

  const { data: notifRows } = await supabase
    .from("apple_notification_log")
    .select("original_transaction_id, product_id, signed_date")
    .eq("offer_type", 3)
    .eq("offer_identifier", codeRow.offer_reference_name)
    .gte("signed_date", since)
    .order("signed_date", { ascending: false })
    .limit(10);

  let notifRow: { original_transaction_id: string; product_id: string | null } | null = null;
  for (const row of notifRows ?? []) {
    if (!row.original_transaction_id) continue;
    if (await otidClaimedByOtherUser(supabase, row.original_transaction_id, auth.userId)) {
      continue;
    }
    notifRow = {
      original_transaction_id: row.original_transaction_id,
      product_id: row.product_id ?? null,
    };
    break;
  }

  if (!notifRow?.original_transaction_id) {
    // Apple hasn't sent the notification yet, or every recent match is
    // already bound to someone else.
    return successResponse({ reconciled: false, reason: "no_notification" }, requestId);
  }

  const otid = notifRow.original_transaction_id;
  const productId = notifRow.product_id;

  // Check if the entitlement is already linked to this OTID.
  const { data: entRow } = await supabase
    .from("entitlements")
    .select("status, original_transaction_id, expires_at")
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (entRow?.original_transaction_id === otid && (entRow.status === "active" || entRow.status === "trial")) {
    // Already linked. Reward only on a paid period — trial start is not a conversion.
    if (entRow.status === "active") {
      await fireRewardRelease(supabase, auth.userId, otid, codeRow.offer_reference_name, productId, requestId);
    }
    await captureReferralEvent(
      auth.userId,
      REFERRAL_EVENT.RECONCILE_SUCCEEDED,
      {
        invite_id: invite.id,
        original_transaction_id: otid,
        product_id: productId,
        status: entRow.status,
        already_linked: true,
      },
      `referral_reconcile:${invite.id}:${otid}`,
    );
    return successResponse({ reconciled: true, status: entRow.status }, requestId);
  }

  // Verify with Apple and update the entitlement with the correct OTID.
  const appleResult = await readAppleSubscription(otid);

  if (!appleResult.ok) {
    console.warn("[referral/reconcile] Apple read failed", { requestId, reason: appleResult.reason });
    await captureReferralEvent(auth.userId, REFERRAL_EVENT.RECONCILE_FAILED, {
      reason: "apple_unavailable",
      invite_id: invite.id,
      original_transaction_id: otid,
    });
    return successResponse({ reconciled: false, reason: "apple_unavailable" }, requestId);
  }

  const appleState = appleResult.state;
  const isActive =
    appleState.status === APPLE_SUBSCRIPTION_STATUS.ACTIVE ||
    appleState.status === APPLE_SUBSCRIPTION_STATUS.BILLING_RETRY ||
    appleState.status === APPLE_SUBSCRIPTION_STATUS.BILLING_GRACE;

  const expiresAt = appleState.expiresAt;
  const entitlementStatus = !isActive
    ? "expired"
    : appleState.isTrialPeriod
      ? "trial"
      : "active";

  if (await otidClaimedByOtherUser(supabase, otid, auth.userId)) {
    await captureReferralEvent(auth.userId, REFERRAL_EVENT.RECONCILE_FAILED, {
      reason: "otid_in_use",
      invite_id: invite.id,
      original_transaction_id: otid,
    });
    return successResponse({ reconciled: false, reason: "otid_in_use" }, requestId);
  }

  // Upsert the entitlement with the correct OTID from the offer-code purchase.
  const { error: upsertErr } = await supabase
    .from("entitlements")
    .upsert({
      user_id: auth.userId,
      status: entitlementStatus,
      product_id: productId ?? appleState.productId ?? null,
      original_transaction_id: otid,
      expires_at: expiresAt,
      source: "apple",
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

  if (upsertErr) {
    console.error("[referral/reconcile] Entitlement upsert failed", upsertErr, { requestId });
    return errorResponse(500, "INTERNAL_ERROR", "Failed to update entitlement", requestId);
  }

  // Record audit event.
  await supabase.from("entitlement_events").insert({
    user_id: auth.userId,
    event_type: "referral_reconcile",
    product_id: productId ?? null,
    metadata: { original_transaction_id: otid, status: entitlementStatus, requestId },
  });

  // Drain pending notifications for this OTID.
  await supabase
    .from("pending_apple_notifications")
    .delete()
    .eq("original_transaction_id", otid);

  // Paid conversion only. A trial after offer-code redeem is access, not a reward.
  if (entitlementStatus === "active") {
    await fireRewardRelease(supabase, auth.userId, otid, codeRow.offer_reference_name, productId, requestId);
  }

  console.log("[referral/reconcile] done", { requestId, otid, status: entitlementStatus });
  await captureReferralEvent(
    auth.userId,
    REFERRAL_EVENT.RECONCILE_SUCCEEDED,
    {
      invite_id: invite.id,
      original_transaction_id: otid,
      product_id: productId ?? appleState.productId ?? null,
      status: entitlementStatus,
      already_linked: false,
      environment: appleState.environment,
    },
    `referral_reconcile:${invite.id}:${otid}`,
  );
  return successResponse({ reconciled: true, status: entitlementStatus }, requestId);
}

async function fireRewardRelease(
  supabase: SupabaseClient,
  userId: string,
  otid: string,
  offerIdentifier: string,
  productId: string | null,
  requestId: string,
): Promise<void> {
  try {
    const { data, error } = await supabase.rpc("release_referral_reward", {
      p_invitee_user_id: userId,
      p_original_transaction_id: otid,
      p_offer_identifier: offerIdentifier,
      p_product_id: productId,
    });
    if (error) {
      console.error("[referral/reconcile] reward release failed", { error: error.message, requestId });
    } else {
      console.log("[referral/reconcile] reward release", { result: data, requestId });
    }
    await emitReferralRewardRelease({
      distinctId: userId,
      rpc: error ? null : (data as { result?: string } | null),
      rpcError: error?.message ?? null,
      source: "referral_reconcile",
      originalTransactionId: otid,
      offerIdentifier,
      productId,
    });
  } catch (err) {
    console.error("[referral/reconcile] reward release threw", err, { requestId });
  }
}
