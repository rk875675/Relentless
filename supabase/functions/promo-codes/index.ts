import { z } from "https://esm.sh/zod@3";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  corsHeaders,
  generateRequestId,
  errorResponse,
  successResponse,
} from "../_shared/response.ts";
import { getUser } from "../_shared/auth.ts";
import { checkRateLimit } from "../_shared/ratelimit.ts";

// ---------------------------------------------------------------------------
// Promo codes (custom in-app codes, server-granted entitlements — no Apple
// involvement in the grant).
//
//   POST /promo-codes/validate — pre-auth. Rate limited by IP. Returns display
//     info for a live code. Every failure mode (nonexistent, inactive, expired,
//     exhausted, creator deactivated) returns the identical { valid: false }
//     so near-miss codes cannot be probed.
//
//   POST /promo-codes/redeem — authenticated. Atomic + idempotent via the
//     redeem_promo_code() SQL function (FOR UPDATE lock on the code row).
//     Writes entitlements (status 'active', source 'promo'), the redemption
//     row, and entitlement_events; fires PostHog promo_code_redeemed.
// ---------------------------------------------------------------------------

const CodeBodySchema = z.object({
  code: z.string().min(1).max(64),
}).strict();

type RedeemRpcResult = {
  result: "redeemed" | "already_redeemed" | "invalid" | "fully_redeemed" | "already_entitled";
  code?: string;
  type?: "months_free" | "lifetime";
  months?: number | null;
  creator_name?: string;
  creator_slug?: string;
  expires_at?: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = generateRequestId();

  if (req.method !== "POST") {
    return errorResponse(405, "VALIDATION_ERROR", "Method not allowed", requestId);
  }

  const url = new URL(req.url);
  const pathMatch = url.pathname.match(/\/promo-codes(?:\/(.+))?$/);
  const subPath = (pathMatch?.[1] ?? "").replace(/\/$/, "");

  if (subPath === "validate") return handleValidate(req, requestId);
  if (subPath === "redeem") return handleRedeem(req, requestId);

  return errorResponse(404, "NOT_FOUND", "Unknown promo-codes path", requestId);
});

// ---------------------------------------------------------------------------
// Body parsing shared by both paths
// ---------------------------------------------------------------------------

async function parseCodeBody(
  req: Request,
  requestId: string,
): Promise<{ ok: true; code: string } | { ok: false; response: Response }> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return {
      ok: false,
      response: errorResponse(400, "VALIDATION_ERROR", "Invalid JSON body", requestId),
    };
  }

  const parsed = CodeBodySchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      response: errorResponse(
        400,
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "Invalid request body",
        requestId,
      ),
    };
  }

  const code = parsed.data.code.trim();
  if (code.length === 0) {
    return {
      ok: false,
      response: errorResponse(400, "VALIDATION_ERROR", "Code must not be empty", requestId),
    };
  }

  return { ok: true, code };
}

// ---------------------------------------------------------------------------
// POST /promo-codes/validate — pre-auth
// ---------------------------------------------------------------------------

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const first = fwd.split(",")[0]?.trim();
  return first && first.length > 0 ? first : "unknown";
}

async function handleValidate(req: Request, requestId: string): Promise<Response> {
  // Pre-auth: rate limit by IP instead of user id (same billing bucket, 10/min).
  const rl = await checkRateLimit(`promo-ip:${clientIp(req)}`, requestId, "billing");
  if (!rl.ok) return rl.response;

  const parsed = await parseCodeBody(req, requestId);
  if (!parsed.ok) return parsed.response;

  const supabase = createServiceClient();

  const invalid = () => successResponse({ valid: false }, requestId);

  // ilike gives the case-insensitive match (backed by the lower(code) unique
  // index semantics), but % _ \ are pattern metacharacters — escape them so a
  // code like "X%" can never wildcard-match other codes.
  const escapedCode = parsed.code.replace(/[\\%_]/g, (m) => `\\${m}`);

  const { data: promo, error } = await supabase
    .from("promo_codes")
    .select(
      "id, code, type, months, active, expires_at, max_redemptions, redemption_count, creators!inner(name, slug, active)",
    )
    .ilike("code", escapedCode)
    .maybeSingle();

  if (error) {
    console.error("[promo-codes/validate] lookup failed", { requestId, error: error.message });
    return errorResponse(500, "INTERNAL_ERROR", "Could not validate code", requestId);
  }

  if (!promo) return invalid();

  const creator = promo.creators as unknown as { name: string; slug: string; active: boolean };

  if (
    !promo.active ||
    !creator?.active ||
    (promo.expires_at && new Date(promo.expires_at) < new Date())
  ) {
    return invalid();
  }

  // promo_codes.redemption_count, not a live count of redemption rows: those
  // cascade away when an account is deleted, which would hand the slot back.
  if (promo.max_redemptions !== null && promo.redemption_count >= promo.max_redemptions) {
    return invalid();
  }

  return successResponse({
    valid: true,
    code: promo.code,
    type: promo.type,
    months: promo.months,
    creator: { name: creator.name, slug: creator.slug },
  }, requestId);
}

// ---------------------------------------------------------------------------
// POST /promo-codes/redeem — authenticated
// ---------------------------------------------------------------------------

async function handleRedeem(req: Request, requestId: string): Promise<Response> {
  const supabase = createServiceClient();

  const auth = await getUser(req, supabase, requestId);
  if (!auth.ok) return auth.response;

  const rl = await checkRateLimit(auth.userId, requestId, "billing");
  if (!rl.ok) return rl.response;

  const parsed = await parseCodeBody(req, requestId);
  if (!parsed.ok) return parsed.response;

  const { data, error } = await supabase.rpc("redeem_promo_code", {
    p_code: parsed.code,
    p_user_id: auth.userId,
  });

  if (error) {
    console.error("[promo-codes/redeem] rpc failed", { requestId, error: error.message });
    return errorResponse(500, "INTERNAL_ERROR", "Could not redeem code", requestId);
  }

  const result = data as RedeemRpcResult;

  switch (result.result) {
    case "invalid":
      return errorResponse(404, "INVALID_CODE", "This code is not valid", requestId);
    case "fully_redeemed":
      return errorResponse(409, "CODE_FULLY_REDEEMED", "This code has already been used", requestId);
    case "already_entitled":
      return errorResponse(
        409,
        "ALREADY_ENTITLED",
        "You already have an active subscription",
        requestId,
      );
    case "redeemed":
    case "already_redeemed": {
      // PostHog only on a fresh redemption — replays must not double-count.
      if (result.result === "redeemed") {
        await capturePostHogEvent(auth.userId, "promo_code_redeemed", {
          promo_code: result.code ?? null,
          promo_creator: result.creator_slug ?? null,
          promo_code_type: result.type ?? null,
          promo_months: result.months ?? null,
          entitlement_expires_at: result.expires_at ?? null,
          $set: {
            promo_code: result.code ?? null,
            promo_creator: result.creator_slug ?? null,
            promo_code_type: result.type ?? null,
            entitlement_status: "active",
            premium: true,
          },
        });
      }

      return successResponse({
        redeemed: true,
        already_redeemed: result.result === "already_redeemed",
        code: result.code ?? null,
        type: result.type ?? null,
        months: result.months ?? null,
        creator: {
          name: result.creator_name ?? null,
          slug: result.creator_slug ?? null,
        },
        entitlement_status: "active",
        expires_at: result.expires_at ?? null,
      }, requestId);
    }
    default:
      console.error("[promo-codes/redeem] unexpected rpc result", { requestId, result });
      return errorResponse(500, "INTERNAL_ERROR", "Could not redeem code", requestId);
  }
}

// ---------------------------------------------------------------------------
// PostHog server-side capture (same pattern as purchases/index.ts)
// ---------------------------------------------------------------------------

async function capturePostHogEvent(
  distinctId: string,
  event: string,
  properties: Record<string, unknown>,
): Promise<void> {
  const apiKey = Deno.env.get("POSTHOG_API_KEY") ?? "";
  const host = (Deno.env.get("POSTHOG_HOST") ?? "https://us.i.posthog.com").replace(/\/$/, "");
  if (!apiKey) return;
  try {
    await fetch(`${host}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        event,
        distinct_id: distinctId,
        properties: { ...properties, $lib: "supabase-edge-function" },
      }),
    });
  } catch {
    // Analytics must never break the redemption flow.
  }
}
