import { createServiceClient } from "../_shared/supabase.ts";
import {
  corsHeaders,
  generateRequestId,
  errorResponse,
  successResponse,
} from "../_shared/response.ts";

// ---------------------------------------------------------------------------
// One-time backfill: fix entitlements rows where the purchases/restore
// function stored product_id=null and expires_at=null because it read
// those fields from the top level of Apple's subscription status response
// instead of decoding the signedTransactionInfo JWS.
//
// Protected by the same cron secret as trial-reminders.
// Safe to re-run — only touches rows with null product_id or expires_at.
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
    console.error("[backfill] Failed to build Apple JWT", err);
    return errorResponse(500, "INTERNAL_ERROR", "Failed to build Apple JWT", requestId);
  }

  const supabase = createServiceClient();

  const { data: rows, error: queryErr } = await supabase
    .from("entitlements")
    .select("user_id, original_transaction_id, status, product_id, expires_at")
    .not("original_transaction_id", "is", null)
    .or("product_id.is.null,expires_at.is.null")
    .order("created_at", { ascending: true })
    .limit(200);

  if (queryErr) {
    console.error("[backfill] Query failed", queryErr);
    return errorResponse(500, "INTERNAL_ERROR", "Failed to query entitlements", requestId);
  }

  const candidates = rows ?? [];
  const result = {
    dry_run: dryRun,
    total_candidates: candidates.length,
    updated: 0,
    skipped_no_data: 0,
    skipped_already_filled: 0,
    failed_apple: 0,
    failed_update: 0,
    details: [] as Record<string, unknown>[],
  };

  for (const row of candidates) {
    const txId = row.original_transaction_id as string;
    const needsProductId = !row.product_id;
    const needsExpiresAt = !row.expires_at;

    if (!needsProductId && !needsExpiresAt) {
      result.skipped_already_filled += 1;
      continue;
    }

    const resolved = await resolveFromApple(txId, appleToken);
    if (!resolved) {
      result.failed_apple += 1;
      result.details.push({
        user_id: row.user_id,
        original_transaction_id: txId,
        error: "apple_api_failed",
      });
      continue;
    }

    if (!resolved.productId && !resolved.expiresAt) {
      result.skipped_no_data += 1;
      result.details.push({
        user_id: row.user_id,
        original_transaction_id: txId,
        error: "no_product_or_expiry_in_jws",
      });
      continue;
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (needsProductId && resolved.productId) updates.product_id = resolved.productId;
    if (needsExpiresAt && resolved.expiresAt) updates.expires_at = resolved.expiresAt;
    if (resolved.entitlementStatus) updates.status = resolved.entitlementStatus;

    const detail: Record<string, unknown> = {
      user_id: row.user_id,
      original_transaction_id: txId,
      old_product_id: row.product_id,
      old_expires_at: row.expires_at,
      old_status: row.status,
      new_product_id: updates.product_id ?? row.product_id,
      new_expires_at: updates.expires_at ?? row.expires_at,
      new_status: updates.status ?? row.status,
    };

    if (dryRun) {
      detail.action = "would_update";
      result.details.push(detail);
      result.updated += 1;
      continue;
    }

    const { error: updateErr } = await supabase
      .from("entitlements")
      .update(updates)
      .eq("user_id", row.user_id);

    if (updateErr) {
      result.failed_update += 1;
      detail.action = "update_failed";
      detail.error = updateErr.message;
      result.details.push(detail);
      continue;
    }

    detail.action = "updated";
    result.details.push(detail);
    result.updated += 1;
  }

  console.log("[backfill] complete", {
    requestId,
    dryRun,
    total: result.total_candidates,
    updated: result.updated,
    failed_apple: result.failed_apple,
    failed_update: result.failed_update,
  });

  return successResponse(result, requestId);
});

// ---------------------------------------------------------------------------
// Apple API helpers (same logic as purchases/index.ts)
// ---------------------------------------------------------------------------

type AppleTransactionPayload = {
  bundleId?: string;
  productId?: string;
  expiresDate?: number;
  offerDiscountType?: string;
  isTrialPeriod?: boolean;
  is_trial_period?: boolean;
};

type ResolvedData = {
  productId: string | null;
  expiresAt: string | null;
  entitlementStatus: string | null;
};

async function resolveFromApple(
  originalTransactionId: string,
  token: string,
): Promise<ResolvedData | null> {
  const tryEnv = async (baseUrl: string) => {
    const res = await fetch(`${baseUrl}/${originalTransactionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status !== 200) return null;
    return await res.json() as {
      data?: Array<{
        lastTransactions?: Array<{
          status: number;
          signedTransactionInfo?: string;
        }>;
      }>;
    };
  };

  let data = await tryEnv(APPLE_PRODUCTION_URL);
  if (!data) {
    data = await tryEnv(APPLE_SANDBOX_URL);
  }
  if (!data) return null;

  const transactions = data.data?.[0]?.lastTransactions ?? [];
  const sorted = [...transactions].sort((a, b) => {
    const priority = (s: number) =>
      s === APPLE_STATUS.ACTIVE || s === APPLE_STATUS.BILLING_GRACE || s === APPLE_STATUS.BILLING_RETRY
        ? 0
        : 1;
    return priority(a.status) - priority(b.status);
  });

  const tx = sorted[0];
  if (!tx?.signedTransactionInfo) return null;

  const payload = decodeJwtPayload<AppleTransactionPayload>(tx.signedTransactionInfo);
  if (!payload) return null;

  if (payload.bundleId && payload.bundleId !== BUNDLE_ID) return null;

  const isActive =
    tx.status === APPLE_STATUS.ACTIVE ||
    tx.status === APPLE_STATUS.BILLING_GRACE ||
    tx.status === APPLE_STATUS.BILLING_RETRY;

  const isTrial =
    payload.isTrialPeriod === true ||
    payload.is_trial_period === true ||
    payload.offerDiscountType?.toUpperCase() === "FREE_TRIAL";

  return {
    productId: payload.productId ?? null,
    expiresAt: payload.expiresDate ? new Date(payload.expiresDate).toISOString() : null,
    entitlementStatus: isActive ? (isTrial ? "trial" : "active") : "expired",
  };
}

// ---------------------------------------------------------------------------
// Apple JWT builder (copied from purchases/index.ts)
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
