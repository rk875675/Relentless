import { createServiceClient } from "../_shared/supabase.ts";
import { capturePostHogEvent, entitlementPersonSet } from "../_shared/posthog.ts";
import {
  corsHeaders,
  generateRequestId,
  errorResponse,
  successResponse,
} from "../_shared/response.ts";

// ---------------------------------------------------------------------------
// reconcile-entitlements — periodic sweep to fix stale entitlement status.
//
// The primary sync path (Apple ASSN webhooks + client restore) is event-driven.
// If a webhook is missed and the user never opens the app, the row stays
// `active` even after the subscription lapses. This function closes that gap
// by proactively querying Apple for every `source='apple'` row whose
// `expires_at` is already in the past (or null — the billing-retry state set
// by DID_FAIL_TO_RENEW when Apple provides no grace-period end).
//
// Scheduled via pg_cron every 6 hours. Also accepts ad-hoc POST calls with
// the same x-cron-secret header, making it safe to invoke manually for
// immediate triage.
//
// Request body (all optional):
//   dryRun  boolean  — report changes without writing (default: false)
//   limit   number   — rows to process per run (default: 100, max: 500)
//
// Secrets required (all already set for other functions):
//   TRIAL_REMINDER_CRON_SECRET   — shared cron auth secret
//   APPLE_IAP_PRIVATE_KEY        — ES256 private key PEM
//   APPLE_IAP_KEY_ID             — App Store Connect key ID
//   APPLE_IAP_ISSUER_ID          — App Store Connect issuer ID
// ---------------------------------------------------------------------------

const BUNDLE_ID = "com.relentlessmentaltoughness.relentless";

const APPLE_PRODUCTION_URL =
  "https://api.storekit.itunes.apple.com/inApps/v1/subscriptions";
const APPLE_SANDBOX_URL =
  "https://api.storekit-sandbox.itunes.apple.com/inApps/v1/subscriptions";

const APPLE_STATUS = {
  ACTIVE: 1,
  EXPIRED: 2,
  BILLING_RETRY: 3,
  BILLING_GRACE: 4,
  REVOKED: 5,
} as const;

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = generateRequestId();

  if (req.method !== "POST") {
    return errorResponse(405, "VALIDATION_ERROR", "Method not allowed", requestId);
  }

  const cronSecret = Deno.env.get("TRIAL_REMINDER_CRON_SECRET") ?? "";
  const providedSecret = req.headers.get("x-cron-secret") ?? "";
  if (!cronSecret || providedSecret !== cronSecret) {
    return errorResponse(401, "UNAUTHENTICATED", "Invalid cron secret", requestId);
  }

  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return errorResponse(400, "VALIDATION_ERROR", "Invalid JSON body", requestId);
  }

  const dryRun = body.dryRun === true;
  const limit =
    typeof body.limit === "number" ? Math.min(Math.max(1, body.limit), 500) : 100;

  const privateKey = Deno.env.get("APPLE_IAP_PRIVATE_KEY") ?? "";
  const keyId = Deno.env.get("APPLE_IAP_KEY_ID") ?? "";
  const issuerId = Deno.env.get("APPLE_IAP_ISSUER_ID") ?? "";

  if (!privateKey || !keyId || !issuerId) {
    return errorResponse(500, "INTERNAL_ERROR", "Apple IAP secrets not configured", requestId);
  }

  let appleToken: string;
  try {
    appleToken = await buildAppleJwt(privateKey, keyId, issuerId);
  } catch (err) {
    console.error("[reconcile] Failed to build Apple JWT", err);
    return errorResponse(500, "INTERNAL_ERROR", "Failed to build Apple JWT", requestId);
  }

  const supabase = createServiceClient();

  // Fetch source='apple' rows that are currently flagged active/trial but
  // whose expiry has already passed (or is unknown from billing-retry state).
  //
  // is_dev accounts are excluded by the original_transaction_id IS NOT NULL
  // filter: dev grants (dev_grant_trial, backfill migration) are always set
  // with original_transaction_id = null, so they cannot appear here.
  //
  // source='promo' rows are excluded by the source='apple' filter — promo
  // grants have no Apple transaction and Apple legitimately says "not active"
  // for them; their access is Relentless-granted, not Apple-granted.
  const now = new Date().toISOString();
  const { data: rows, error: queryErr } = await supabase
    .from("entitlements")
    .select("user_id, original_transaction_id, status, product_id, expires_at")
    .eq("source", "apple")
    .in("status", ["trial", "active"])
    .or(`expires_at.is.null,expires_at.lt.${now}`)
    .not("original_transaction_id", "is", null)
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (queryErr) {
    console.error("[reconcile] Query failed", queryErr);
    return errorResponse(500, "INTERNAL_ERROR", "Failed to query entitlements", requestId);
  }

  const candidates = rows ?? [];

  const result = {
    dry_run: dryRun,
    total_candidates: candidates.length,
    flipped_expired: 0,
    kept_active_expires_updated: 0,
    kept_active_no_change: 0,
    failed_apple: 0,
    details: [] as Record<string, unknown>[],
  };

  for (const row of candidates) {
    const txId = row.original_transaction_id as string;
    const resolved = await resolveFromApple(txId, appleToken);

    if (!resolved) {
      result.failed_apple += 1;
      result.details.push({
        user_id: row.user_id,
        original_transaction_id: txId,
        old_status: row.status,
        error: "apple_api_failed",
      });
      continue;
    }

    const detail: Record<string, unknown> = {
      user_id: row.user_id,
      original_transaction_id: txId,
      old_status: row.status,
      old_expires_at: row.expires_at,
      apple_raw_status: resolved.rawStatus,
      new_status: resolved.newStatus,
      new_expires_at: resolved.expiresAt,
    };

    if (resolved.newStatus === "expired") {
      // Apple confirms lapsed — flip to expired.
      detail.action = dryRun ? "would_flip_expired" : "flipped_expired";
      result.details.push(detail);
      result.flipped_expired += 1;

      if (!dryRun) {
        const { error: updateErr } = await supabase
          .from("entitlements")
          .update({
            status: "expired",
            // Prefer Apple's reported expiry over the stale local value.
            expires_at: resolved.expiresAt ?? row.expires_at,
            ...(resolved.productId ? { product_id: resolved.productId } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", row.user_id);

        if (updateErr) {
          console.error("[reconcile] Failed to update entitlement to expired", {
            userId: row.user_id,
            error: updateErr.message,
          });
        } else {
          await supabase.from("entitlement_events").insert({
            user_id: row.user_id,
            event_type: "reconciled",
            product_id: resolved.productId ?? row.product_id ?? null,
            metadata: {
              action: "flipped_expired",
              previous_status: row.status,
              new_status: "expired",
              old_expires_at: row.expires_at,
              new_expires_at: resolved.expiresAt ?? row.expires_at,
              apple_raw_status: resolved.rawStatus,
              original_transaction_id: txId,
            },
          });

          console.log("[reconcile] Flipped to expired", {
            userId: row.user_id,
            previousStatus: row.status,
            oldExpiresAt: row.expires_at,
            newExpiresAt: resolved.expiresAt,
          });

          await capturePostHogEvent(row.user_id, "subscription_state_synced", {
            notification_type: "reconcile",
            previous_status: row.status,
            new_status: "expired",
            product_id: resolved.productId ?? row.product_id ?? null,
            original_transaction_id: txId,
            $set: entitlementPersonSet("expired"),
          });
        }
      }
      continue;
    }

    // Apple still considers this subscription active (ACTIVE, BILLING_GRACE,
    // BILLING_RETRY). This can happen for billing-retry rows (expires_at=null)
    // where the user is still in the billing-retry window.
    // Update expires_at if Apple provided a newer value, so future runs know
    // the real expiry and the lazy requireEntitlement check stays accurate.
    const expiresAtChanged =
      resolved.expiresAt !== null && resolved.expiresAt !== row.expires_at;

    if (expiresAtChanged) {
      detail.action = dryRun ? "would_update_expires_at" : "updated_expires_at";
      result.kept_active_expires_updated += 1;

      if (!dryRun) {
        await supabase
          .from("entitlements")
          .update({
            expires_at: resolved.expiresAt,
            ...(resolved.productId ? { product_id: resolved.productId } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", row.user_id);

        await supabase.from("entitlement_events").insert({
          user_id: row.user_id,
          event_type: "reconciled",
          product_id: resolved.productId ?? row.product_id ?? null,
          metadata: {
            action: "updated_expires_at",
            previous_status: row.status,
            new_status: row.status,
            old_expires_at: row.expires_at,
            new_expires_at: resolved.expiresAt,
            apple_raw_status: resolved.rawStatus,
            original_transaction_id: txId,
          },
        });
      }
    } else {
      detail.action = "kept_active_no_change";
      result.kept_active_no_change += 1;
    }

    result.details.push(detail);
  }

  console.log("[reconcile] complete", {
    requestId,
    dryRun,
    total: result.total_candidates,
    flipped_expired: result.flipped_expired,
    kept_active_expires_updated: result.kept_active_expires_updated,
    kept_active_no_change: result.kept_active_no_change,
    failed_apple: result.failed_apple,
  });

  return successResponse(result, requestId);
});

// ---------------------------------------------------------------------------
// Apple resolution
// ---------------------------------------------------------------------------

type ResolvedAppleData = {
  rawStatus: number;
  newStatus: "active" | "trial" | "expired";
  productId: string | null;
  expiresAt: string | null;
};

type AppleSubscriptionResponse = {
  data?: Array<{
    lastTransactions?: Array<{
      status: number;
      signedTransactionInfo?: string;
    }>;
  }>;
};

type AppleTransactionPayload = {
  bundleId?: string;
  productId?: string;
  expiresDate?: number;
  offerDiscountType?: string;
  isTrialPeriod?: boolean;
  is_trial_period?: boolean;
};

async function resolveFromApple(
  originalTransactionId: string,
  token: string,
): Promise<ResolvedAppleData | null> {
  const tryFetch = async (baseUrl: string) => {
    try {
      const res = await fetch(`${baseUrl}/${originalTransactionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status !== 200) return null;
      return (await res.json()) as AppleSubscriptionResponse;
    } catch {
      return null;
    }
  };

  let data = await tryFetch(APPLE_PRODUCTION_URL);
  if (!data) {
    data = await tryFetch(APPLE_SANDBOX_URL);
  }
  if (!data) return null;

  const transactions = data.data?.[0]?.lastTransactions ?? [];
  if (transactions.length === 0) return null;

  // Prefer active-ish statuses so we don't wrongly flip a billing-retry sub.
  const sorted = [...transactions].sort((a, b) => {
    const priority = (s: number) =>
      s === APPLE_STATUS.ACTIVE ||
      s === APPLE_STATUS.BILLING_GRACE ||
      s === APPLE_STATUS.BILLING_RETRY
        ? 0
        : 1;
    return priority(a.status) - priority(b.status);
  });

  const tx = sorted[0];
  const payload = tx.signedTransactionInfo
    ? decodeJwtPayload<AppleTransactionPayload>(tx.signedTransactionInfo)
    : null;

  if (payload?.bundleId && payload.bundleId !== BUNDLE_ID) return null;

  const isActive =
    tx.status === APPLE_STATUS.ACTIVE ||
    tx.status === APPLE_STATUS.BILLING_GRACE ||
    tx.status === APPLE_STATUS.BILLING_RETRY;

  const isTrial =
    payload?.isTrialPeriod === true ||
    payload?.is_trial_period === true ||
    payload?.offerDiscountType?.toUpperCase() === "FREE_TRIAL";

  const expiresAt = payload?.expiresDate
    ? new Date(payload.expiresDate).toISOString()
    : null;

  return {
    rawStatus: tx.status,
    newStatus: isActive ? (isTrial ? "trial" : "active") : "expired",
    productId: payload?.productId ?? null,
    expiresAt,
  };
}

// ---------------------------------------------------------------------------
// Apple JWT builder (ES256 — same as purchases/index.ts and backfill-entitlements)
// ---------------------------------------------------------------------------

async function buildAppleJwt(
  privateKeyPem: string,
  keyId: string,
  issuerId: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const payload = {
    iss: issuerId,
    iat: now,
    exp: now + 3600,
    aud: "appstoreconnect-v1",
    bid: BUNDLE_ID,
  };

  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const headerB64 = encode(header);
  const payloadB64 = encode(payload);
  const signingInput = `${headerB64}.${payloadB64}`;

  const keyDer = pemToDer(privateKeyPem);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyDer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const signatureBuffer = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `${signingInput}.${signatureB64}`;
}

function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function decodeJwtPayload<T>(jwt: string): T | null {
  const p = jwt.split(".")[1];
  if (!p) return null;
  try {
    const normalized = p.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    return JSON.parse(atob(padded)) as T;
  } catch {
    return null;
  }
}
