import { createServiceClient } from "../_shared/supabase.ts";
import {
  capturePostHogBatch,
  entitlementPersonSet,
} from "../_shared/posthog.ts";
import {
  corsHeaders,
  generateRequestId,
  errorResponse,
  successResponse,
} from "../_shared/response.ts";

// ---------------------------------------------------------------------------
// backfill-posthog-entitlements — analytics only.
//
// Copies live entitlement status onto PostHog person properties so
// entitlement_status / premium stop reflecting a grant that was never
// cleared. Does not change entitlements, Apple state, or app access.
//
// Write rules (person property only):
//   no entitlement row                         → none
//   trial  + expires_at in the past            → expired
//   active + promo + expires_at in the past    → expired
//   active + apple + expires_at in the past    → keep active
//     (billing retry / grace; Apple is the authority)
//   otherwise                                  → stored status
//
// Auth: x-cron-secret (same as reconcile) OR Bearer matching the
// function service key. dryRun defaults to true; apply requires
// { "dryRun": false }.
// ---------------------------------------------------------------------------

const PAGE_SIZE = 500;
const POSTHOG_BATCH = 100;
const KNOWN_STATUSES = new Set(["trial", "active", "expired", "none"]);

type EntRow = {
  status: string | null;
  expires_at: string | null;
  source: string | null;
};

type Histogram = Record<string, number>;

function bump(hist: Histogram, key: string): void {
  hist[key] = (hist[key] ?? 0) + 1;
}

function asEntRow(value: unknown): EntRow | null {
  if (!value) return null;
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const rec = row as Record<string, unknown>;
  return {
    status: typeof rec.status === "string" ? rec.status : null,
    expires_at: typeof rec.expires_at === "string" ? rec.expires_at : null,
    source: typeof rec.source === "string" ? rec.source : null,
  };
}

function writeStatus(row: EntRow | null, nowMs: number): string {
  if (!row?.status) return "none";
  const status = KNOWN_STATUSES.has(row.status) ? row.status : "none";
  const expMs = row.expires_at ? Date.parse(row.expires_at) : Number.NaN;
  const past = Number.isFinite(expMs) && expMs <= nowMs;
  if (status === "trial" && past) return "expired";
  if (status === "active" && past && row.source === "promo") return "expired";
  return status;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    const parsed = JSON.parse(atob(b64 + pad));
    return parsed && typeof parsed === "object"
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function authorized(req: Request): boolean {
  const cronSecret = Deno.env.get("TRIAL_REMINDER_CRON_SECRET") ?? "";
  const provided = req.headers.get("x-cron-secret") ?? "";
  if (cronSecret && provided === cronSecret) return true;

  const auth = req.headers.get("Authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!bearer) return false;

  const serviceKeys = [
    Deno.env.get("SB_SECRET_KEY") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  ].filter(Boolean);
  if (serviceKeys.includes(bearer)) return true;

  // Functions gateway accepts the legacy service_role JWT but rejects
  // sb_secret keys. Function env may store only sb_secret values, so
  // exact-match above fails. A registered service_role JWT is enough.
  return decodeJwtPayload(bearer)?.role === "service_role";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = generateRequestId();

  if (req.method !== "POST") {
    return errorResponse(405, "VALIDATION_ERROR", "Method not allowed", requestId);
  }

  if (!authorized(req)) {
    return errorResponse(401, "UNAUTHENTICATED", "Invalid cron secret", requestId);
  }

  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return errorResponse(400, "VALIDATION_ERROR", "Invalid JSON body", requestId);
  }

  const dryRun = body.dryRun !== false;

  const supabase = createServiceClient();
  const nowMs = Date.now();

  const stored: Histogram = {};
  const write: Histogram = {};
  let profiles = 0;
  let entitlementRows = 0;
  let trialPastExpiry = 0;
  let promoPastExpiry = 0;
  let trialNoExpiry = 0;
  const pending: Array<{
    distinctId: string;
    event: string;
    properties: Record<string, unknown>;
  }> = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, entitlements(status, expires_at, source)")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error("[backfill-posthog-entitlements] profile page failed", error.message);
      return errorResponse(500, "INTERNAL_ERROR", "Failed to read entitlements", requestId);
    }

    const rows = data ?? [];
    if (rows.length === 0) break;

    for (const profile of rows) {
      const userId = typeof profile.id === "string" ? profile.id : "";
      if (!userId) continue;
      profiles += 1;
      const ent = asEntRow(profile.entitlements);
      if (ent) entitlementRows += 1;
      const storedStatus = ent?.status && KNOWN_STATUSES.has(ent.status) ? ent.status : "none";
      const next = writeStatus(ent, nowMs);
      bump(stored, storedStatus);
      bump(write, next);
      if (ent?.status === "trial" && next === "expired") trialPastExpiry += 1;
      if (ent?.status === "active" && ent.source === "promo" && next === "expired") {
        promoPastExpiry += 1;
      }
      if (ent?.status === "trial" && !ent.expires_at) trialNoExpiry += 1;
      pending.push({
        distinctId: userId,
        event: "$set",
        properties: { $set: entitlementPersonSet(next) },
      });
    }

    if (rows.length < PAGE_SIZE) break;
  }

  let posted = 0;
  let posthogOk = true;
  if (!dryRun) {
    for (let i = 0; i < pending.length; i += POSTHOG_BATCH) {
      const ok = await capturePostHogBatch(pending.slice(i, i + POSTHOG_BATCH));
      if (!ok) posthogOk = false;
      else posted += Math.min(POSTHOG_BATCH, pending.length - i);
    }
  }

  const result = {
    dry_run: dryRun,
    profiles,
    entitlements: entitlementRows,
    stored,
    write,
    trial_past_expiry: trialPastExpiry,
    promo_past_expiry: promoPastExpiry,
    trial_no_expiry: trialNoExpiry,
    posted,
    posthog_ok: dryRun ? null : posthogOk,
  };

  console.log("[backfill-posthog-entitlements] complete", { requestId, ...result });
  return successResponse(result, requestId);
});
