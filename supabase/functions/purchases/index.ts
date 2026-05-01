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
import {
  checkIdempotencyKey,
  storeIdempotencyKey,
} from "../_shared/idempotency.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BUNDLE_ID = "com.relentlessmentaltoughness.relentless";

const APPLE_PRODUCTION_URL =
  "https://api.storekit.itunes.apple.com/inApps/v1/subscriptions";
const APPLE_SANDBOX_URL =
  "https://api.storekit-sandbox.itunes.apple.com/inApps/v1/subscriptions";

/**
 * Apple App Store Server API subscription status codes.
 * https://developer.apple.com/documentation/appstoreserverapi/status
 */
const APPLE_STATUS = {
  ACTIVE: 1,
  EXPIRED: 2,
  BILLING_RETRY: 3,  // grace period — treat as active
  BILLING_GRACE: 4,  // billing grace — treat as active
  REVOKED: 5,
} as const;

const RestoreBodySchema = z.object({
  originalTransactionId: z.string().min(1).max(256),
}).strict();

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = generateRequestId();

  if (req.method !== "POST") {
    return errorResponse(405, "VALIDATION_ERROR", "Method not allowed", requestId);
  }

  const url = new URL(req.url);
  const pathMatch = url.pathname.match(/\/purchases(?:\/(.+))?$/);
  const subPath = (pathMatch?.[1] ?? "").replace(/\/$/, "");

  if (subPath !== "restore") {
    return errorResponse(404, "NOT_FOUND", "Unknown purchases path", requestId);
  }

  const supabase = createServiceClient();
  const auth = await getUser(req, supabase, requestId);
  if (!auth.ok) return auth.response;

  const rl = await checkRateLimit(auth.userId, requestId, "billing");
  if (!rl.ok) return rl.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "VALIDATION_ERROR", "Invalid JSON body", requestId);
  }

  const parsed = RestoreBodySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Invalid request body",
      requestId,
    );
  }

  const { originalTransactionId } = parsed.data;

  const idempotencyKey = req.headers.get("Idempotency-Key");
  if (!idempotencyKey) {
    return errorResponse(400, "VALIDATION_ERROR", "Idempotency-Key header is required", requestId);
  }

  const idem = await checkIdempotencyKey(supabase, idempotencyKey, auth.userId, requestId);
  if (idem.replay) return idem.response;

  // ---------------------------------------------------------------------------
  // Apple App Store Server API verification
  // ---------------------------------------------------------------------------

  const privateKey = Deno.env.get("APPLE_IAP_PRIVATE_KEY") ?? "";
  const keyId = Deno.env.get("APPLE_IAP_KEY_ID") ?? "";
  const issuerId = Deno.env.get("APPLE_IAP_ISSUER_ID") ?? "";

  if (!privateKey || !keyId || !issuerId) {
    console.error("[purchases/restore] Apple IAP secrets not configured");
    return errorResponse(500, "INTERNAL_ERROR", "Purchase verification not configured", requestId);
  }

  let appleToken: string;
  try {
    appleToken = await buildAppleJwt(privateKey, keyId, issuerId);
  } catch (err) {
    console.error("[purchases/restore] Failed to build Apple JWT", err);
    return errorResponse(500, "INTERNAL_ERROR", "Failed to build purchase verification token", requestId);
  }

  // Try production; fall back to sandbox on environment mismatch
  let appleData: AppleSubscriptionResponse | null = null;
  let isSandbox = false;

  const productionResult = await fetchAppleSubscription(
    APPLE_PRODUCTION_URL,
    originalTransactionId,
    appleToken,
  );

  if (productionResult.ok) {
    appleData = productionResult.data;
  } else if (productionResult.environmentMismatch) {
    const sandboxResult = await fetchAppleSubscription(
      APPLE_SANDBOX_URL,
      originalTransactionId,
      appleToken,
    );
    if (sandboxResult.ok) {
      appleData = sandboxResult.data;
      isSandbox = true;
    } else {
      return errorResponse(
        422,
        "VALIDATION_ERROR",
        "Purchase could not be verified with Apple",
        requestId,
      );
    }
  } else {
    return errorResponse(
      422,
      "VALIDATION_ERROR",
      "Purchase could not be verified with Apple",
      requestId,
    );
  }

  // ---------------------------------------------------------------------------
  // Determine entitlement status from Apple response
  // ---------------------------------------------------------------------------

  const { entitlementStatus, productId, expiresAt } = resolveEntitlement(appleData);

  // ---------------------------------------------------------------------------
  // Update entitlements table
  // ---------------------------------------------------------------------------

  const { error: upsertErr } = await supabase
    .from("entitlements")
    .update({
      status: entitlementStatus,
      product_id: productId ?? null,
      expires_at: expiresAt ?? null,
    })
    .eq("user_id", auth.userId);

  if (upsertErr) {
    console.error("[purchases/restore] Failed to update entitlements", upsertErr);
    return errorResponse(500, "INTERNAL_ERROR", "Failed to update entitlement", requestId);
  }

  // Record audit event
  await supabase.from("entitlement_events").insert({
    user_id: auth.userId,
    event_type: "restore",
    product_id: productId ?? null,
    metadata: {
      original_transaction_id: originalTransactionId,
      entitlement_status: entitlementStatus,
      is_sandbox: isSandbox,
      expires_at: expiresAt ?? null,
    },
  });

  const responseBody = {
    entitlement_status: entitlementStatus,
    product_id: productId ?? null,
  };

  await storeIdempotencyKey(supabase, idempotencyKey, auth.userId, 200, responseBody);

  return successResponse(responseBody, requestId);
});

// ---------------------------------------------------------------------------
// Apple JWT builder (App Store Server API — ES256)
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

// ---------------------------------------------------------------------------
// Apple API fetch
// ---------------------------------------------------------------------------

type AppleSubscriptionResponse = {
  data?: Array<{
    lastTransactions?: Array<{
      status: number;
      productId?: string;
      expiresDate?: number;
      signedTransactionInfo?: string;
    }>;
  }>;
};

type FetchResult =
  | { ok: true; data: AppleSubscriptionResponse }
  | { ok: false; environmentMismatch: boolean };

async function fetchAppleSubscription(
  baseUrl: string,
  originalTransactionId: string,
  token: string,
): Promise<FetchResult> {
  const res = await fetch(`${baseUrl}/${originalTransactionId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (res.status === 200) {
    const data = await res.json() as AppleSubscriptionResponse;
    return { ok: true, data };
  }

  // 4040010 = not found in this environment (try other environment)
  if (res.status === 404) {
    let errCode: number | undefined;
    try {
      const body = await res.json() as { errorCode?: number };
      errCode = body.errorCode;
    } catch { /* noop */ }
    if (errCode === 4040010) {
      return { ok: false, environmentMismatch: true };
    }
  }

  return { ok: false, environmentMismatch: false };
}

// ---------------------------------------------------------------------------
// Entitlement resolution from Apple response
// ---------------------------------------------------------------------------

function resolveEntitlement(data: AppleSubscriptionResponse): {
  entitlementStatus: string;
  productId: string | null;
  expiresAt: string | null;
} {
  const transactions = data.data?.[0]?.lastTransactions ?? [];

  // Find most recent transaction — prefer active/grace states
  const sorted = [...transactions].sort((a, b) => {
    const priority = (s: number) =>
      s === APPLE_STATUS.ACTIVE || s === APPLE_STATUS.BILLING_GRACE || s === APPLE_STATUS.BILLING_RETRY
        ? 0
        : 1;
    return priority(a.status) - priority(b.status);
  });

  const tx = sorted[0];
  if (!tx) {
    return { entitlementStatus: "none", productId: null, expiresAt: null };
  }

  const isActive =
    tx.status === APPLE_STATUS.ACTIVE ||
    tx.status === APPLE_STATUS.BILLING_GRACE ||
    tx.status === APPLE_STATUS.BILLING_RETRY;

  const expiresAt = tx.expiresDate
    ? new Date(tx.expiresDate).toISOString()
    : null;

  return {
    entitlementStatus: isActive
      ? isFreeTrialTransaction(tx.signedTransactionInfo)
        ? "trial"
        : "active"
      : "expired",
    productId: tx.productId ?? null,
    expiresAt,
  };
}

type AppleTransactionPayload = {
  offerDiscountType?: string;
  isTrialPeriod?: boolean;
  is_trial_period?: boolean;
};

function isFreeTrialTransaction(signedTransactionInfo?: string): boolean {
  if (!signedTransactionInfo) return false;

  const payload = decodeJwtPayload<AppleTransactionPayload>(signedTransactionInfo);
  if (!payload) return false;

  return (
    payload.isTrialPeriod === true ||
    payload.is_trial_period === true ||
    payload.offerDiscountType?.toUpperCase() === "FREE_TRIAL"
  );
}

function decodeJwtPayload<T>(jwt: string): T | null {
  const payload = jwt.split(".")[1];
  if (!payload) return null;

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    return JSON.parse(atob(padded)) as T;
  } catch {
    return null;
  }
}
