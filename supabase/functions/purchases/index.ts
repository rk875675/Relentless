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
const APPLE_PRODUCTION_TRANSACTION_URL =
  "https://api.storekit.itunes.apple.com/inApps/v1/transactions";
const APPLE_SANDBOX_TRANSACTION_URL =
  "https://api.storekit-sandbox.itunes.apple.com/inApps/v1/transactions";

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

  // Try subscription status first; fall back to direct transaction lookup if
  // Superwall/StoreKit gave us a transaction id rather than an original id.
  let resolvedEntitlement: ResolvedEntitlement | null = null;
  let isSandbox = false;

  const productionResult = await fetchAppleSubscription(
    APPLE_PRODUCTION_URL,
    originalTransactionId,
    appleToken,
  );

  if (productionResult.ok) {
    resolvedEntitlement = resolveEntitlement(productionResult.data);
  } else if (productionResult.shouldTryOtherEnvironment) {
    // Try sandbox. For brand-new purchases the Apple sandbox Server API can
    // take several seconds to index the transaction — retry up to 2 extra
    // times with a 3 s delay before falling back to transaction lookup.
    let sandboxResult = await fetchAppleSubscription(
      APPLE_SANDBOX_URL,
      originalTransactionId,
      appleToken,
    );
    for (let attempt = 1; attempt <= 2 && !sandboxResult.ok && sandboxResult.shouldTryOtherEnvironment; attempt++) {
      await new Promise<void>((r) => setTimeout(r, 3000));
      sandboxResult = await fetchAppleSubscription(
        APPLE_SANDBOX_URL,
        originalTransactionId,
        appleToken,
      );
    }
    if (sandboxResult.ok) {
      resolvedEntitlement = resolveEntitlement(sandboxResult.data);
      isSandbox = true;
    } else {
      const transactionResult = await verifyViaTransactionLookup(
        originalTransactionId,
        appleToken,
      );
      if (transactionResult.ok) {
        resolvedEntitlement = transactionResult.entitlement;
        isSandbox = transactionResult.isSandbox;
      } else {
        console.error("[purchases/restore] Apple verification failed", {
          requestId,
          subscriptionStatus: sandboxResult.status,
          subscriptionErrorCode: sandboxResult.errorCode,
          transactionStatus: transactionResult.status,
          transactionErrorCode: transactionResult.errorCode,
        });
        return errorResponse(
          422,
          "VALIDATION_ERROR",
          "Purchase could not be verified with Apple",
          requestId,
        );
      }
    }
  } else {
    const transactionResult = await verifyViaTransactionLookup(
      originalTransactionId,
      appleToken,
    );
    if (transactionResult.ok) {
      resolvedEntitlement = transactionResult.entitlement;
      isSandbox = transactionResult.isSandbox;
    } else {
      console.error("[purchases/restore] Apple verification failed", {
        requestId,
        subscriptionStatus: productionResult.status,
        subscriptionErrorCode: productionResult.errorCode,
        transactionStatus: transactionResult.status,
        transactionErrorCode: transactionResult.errorCode,
      });
      return errorResponse(
        422,
        "VALIDATION_ERROR",
        "Purchase could not be verified with Apple",
        requestId,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Determine entitlement status from Apple response
  // ---------------------------------------------------------------------------

  if (!resolvedEntitlement) {
    console.error("[purchases/restore] Apple verification did not produce entitlement", { requestId });
    return errorResponse(
      422,
      "VALIDATION_ERROR",
      "Purchase could not be verified with Apple",
      requestId,
    );
  }

  const { entitlementStatus, productId, expiresAt } = resolvedEntitlement;

  // ---------------------------------------------------------------------------
  // Update entitlements table
  // ---------------------------------------------------------------------------

  const { error: upsertErr } = await supabase
    .from("entitlements")
    .upsert({
      user_id: auth.userId,
      status: entitlementStatus,
      product_id: productId ?? null,
      starts_at: new Date().toISOString(),
      expires_at: expiresAt ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

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

type ResolvedEntitlement = {
  entitlementStatus: string;
  productId: string | null;
  expiresAt: string | null;
};

type FetchResult =
  | { ok: true; data: AppleSubscriptionResponse }
  | {
      ok: false;
      shouldTryOtherEnvironment: boolean;
      status: number;
      errorCode?: string;
    };

type TransactionFetchResult =
  | { ok: true; signedTransactionInfo: string }
  | { ok: false; shouldTryOtherEnvironment: boolean; status: number; errorCode?: string };

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

  // Sandbox transactions queried against production can return different 404
  // bodies across StoreKit/App Store Server API paths. Any production 404 is
  // safe to retry against sandbox; sandbox failures still return false.
  if (res.status === 404) {
    let errCode: string | undefined;
    try {
      const body = await res.json() as { errorCode?: number | string };
      errCode = body.errorCode == null ? undefined : String(body.errorCode);
    } catch { /* noop */ }
    return { ok: false, shouldTryOtherEnvironment: true, status: res.status, errorCode: errCode };
  }

  return { ok: false, shouldTryOtherEnvironment: false, status: res.status };
}

async function fetchAppleTransaction(
  baseUrl: string,
  transactionId: string,
  token: string,
): Promise<TransactionFetchResult> {
  const res = await fetch(`${baseUrl}/${transactionId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (res.status === 200) {
    const data = await res.json() as { signedTransactionInfo?: string };
    if (typeof data.signedTransactionInfo === "string" && data.signedTransactionInfo.length > 0) {
      return { ok: true, signedTransactionInfo: data.signedTransactionInfo };
    }
    return { ok: false, shouldTryOtherEnvironment: false, status: res.status };
  }

  if (res.status === 404) {
    let errCode: string | undefined;
    try {
      const body = await res.json() as { errorCode?: number | string };
      errCode = body.errorCode == null ? undefined : String(body.errorCode);
    } catch { /* noop */ }
    return { ok: false, shouldTryOtherEnvironment: true, status: res.status, errorCode: errCode };
  }

  return { ok: false, shouldTryOtherEnvironment: false, status: res.status };
}

async function verifyViaTransactionLookup(
  transactionId: string,
  token: string,
): Promise<
  | { ok: true; entitlement: ResolvedEntitlement; isSandbox: boolean }
  | { ok: false; status: number; errorCode?: string }
> {
  const productionResult = await fetchAppleTransaction(
    APPLE_PRODUCTION_TRANSACTION_URL,
    transactionId,
    token,
  );
  if (productionResult.ok) {
    return {
      ok: true,
      entitlement: resolveEntitlementFromSignedTransaction(productionResult.signedTransactionInfo),
      isSandbox: false,
    };
  }
  if (!productionResult.shouldTryOtherEnvironment) {
    return { ok: false, status: productionResult.status, errorCode: productionResult.errorCode };
  }

  const sandboxResult = await fetchAppleTransaction(
    APPLE_SANDBOX_TRANSACTION_URL,
    transactionId,
    token,
  );
  if (sandboxResult.ok) {
    return {
      ok: true,
      entitlement: resolveEntitlementFromSignedTransaction(sandboxResult.signedTransactionInfo),
      isSandbox: true,
    };
  }
  return { ok: false, status: sandboxResult.status, errorCode: sandboxResult.errorCode };
}

// ---------------------------------------------------------------------------
// Entitlement resolution from Apple response
// ---------------------------------------------------------------------------

function resolveEntitlement(data: AppleSubscriptionResponse): ResolvedEntitlement {
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
  bundleId?: string;
  productId?: string;
  expiresDate?: number;
  offerDiscountType?: string;
  isTrialPeriod?: boolean;
  is_trial_period?: boolean;
};

function resolveEntitlementFromSignedTransaction(signedTransactionInfo: string): ResolvedEntitlement {
  const payload = decodeJwtPayload<AppleTransactionPayload>(signedTransactionInfo);
  if (!payload || payload.bundleId !== BUNDLE_ID) {
    return { entitlementStatus: "none", productId: null, expiresAt: null };
  }

  const expiresAt = payload.expiresDate
    ? new Date(payload.expiresDate).toISOString()
    : null;
  const isActive = payload.expiresDate ? payload.expiresDate > Date.now() : false;

  return {
    entitlementStatus: isActive
      ? isFreeTrialTransaction(signedTransactionInfo)
        ? "trial"
        : "active"
      : "expired",
    productId: payload.productId ?? null,
    expiresAt,
  };
}

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
