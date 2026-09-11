import { verifyAppleJws } from "./apple_jws.ts";

// ---------------------------------------------------------------------------
// Authoritative subscription state for one Apple original_transaction_id,
// read live from the App Store Server API (getAllSubscriptionStatuses).
//
// Referral sharer eligibility (PRD 10.5.3) needs facts our entitlements table
// does not carry: whether auto-renew is on, whether the subscription is in
// billing retry or grace (entitlements collapses both into 'active'), whether
// a promotional offer is already attached to the next renewal, and which Apple
// environment the account lives in. Rather than widen the purchase/restore
// path to record them — a deliberate decision, that path is left untouched —
// eligibility reads Apple directly through this module.
//
// Both signed payloads are verified against Apple's pinned root before any
// field is trusted, matching the apple-notifications handler.
// ---------------------------------------------------------------------------

const BUNDLE_ID = "com.relentlessmentaltoughness.relentless";

const SUBSCRIPTIONS_URL = {
  production: "https://api.storekit.itunes.apple.com/inApps/v1/subscriptions",
  sandbox: "https://api.storekit-sandbox.itunes.apple.com/inApps/v1/subscriptions",
} as const;

/** https://developer.apple.com/documentation/appstoreserverapi/status */
export const APPLE_SUBSCRIPTION_STATUS = {
  ACTIVE: 1,
  EXPIRED: 2,
  BILLING_RETRY: 3,
  BILLING_GRACE: 4,
  REVOKED: 5,
} as const;

export type AppleEnvironment = "production" | "sandbox";

export type AppleSubscriptionState = {
  environment: AppleEnvironment;
  /** APPLE_SUBSCRIPTION_STATUS value. */
  status: number;
  productId: string | null;
  expiresAt: string | null;
  /** renewalInfo.autoRenewStatus: 0 = cancelled, 1 = on. Null when absent. */
  autoRenewStatus: number | null;
  autoRenewProductId: string | null;
  /** Offer already attached to the upcoming renewal, if any. */
  renewalOfferIdentifier: string | null;
  renewalOfferType: number | null;
};

export type AppleSubscriptionResult =
  | { ok: true; state: AppleSubscriptionState }
  | { ok: false; reason: "not_configured" | "not_found" | "unavailable" | "untrusted" };

type StatusResponse = {
  environment?: string;
  data?: Array<{
    lastTransactions?: Array<{
      originalTransactionId?: string;
      status?: number;
      signedTransactionInfo?: string;
      signedRenewalInfo?: string;
    }>;
  }>;
};

type TransactionPayload = {
  bundleId?: string;
  productId?: string;
  expiresDate?: number;
  originalTransactionId?: string;
};

type RenewalPayload = {
  autoRenewStatus?: number;
  autoRenewProductId?: string;
  offerIdentifier?: string;
  offerType?: number;
  originalTransactionId?: string;
};

// ---------------------------------------------------------------------------
// ES256 JWT for the App Store Server API
// ---------------------------------------------------------------------------

function base64Url(bytes: Uint8Array | string): string {
  const raw = typeof bytes === "string"
    ? btoa(bytes)
    : btoa(String.fromCharCode(...bytes));
  return raw.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToDer(pem: string): ArrayBuffer {
  // Strips any PEM armor line generically. Written without the literal header
  // text on purpose: the pre-commit secret scanner matches that delimiter on
  // sight, and the bare form is exactly what a pasted key looks like, so the
  // scanner should keep flagging it. This also tolerates EC/RSA armor.
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function buildAppleJwt(
  privateKeyPem: string,
  keyId: string,
  issuerId: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
  const payload = base64Url(JSON.stringify({
    iss: issuerId,
    iat: now,
    exp: now + 3600,
    aud: "appstoreconnect-v1",
    bid: BUNDLE_ID,
  }));
  const signingInput = `${header}.${payload}`;

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(privateKeyPem),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

async function fetchStatuses(
  environment: AppleEnvironment,
  originalTransactionId: string,
  token: string,
): Promise<{ ok: true; body: StatusResponse } | { ok: false; retryOtherEnv: boolean }> {
  let res: Response;
  try {
    res = await fetch(`${SUBSCRIPTIONS_URL[environment]}/${originalTransactionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return { ok: false, retryOtherEnv: false };
  }

  if (res.status === 200) {
    return { ok: true, body: await res.json() as StatusResponse };
  }
  // A sandbox transaction queried against production returns 404; that is the
  // documented way to discover which environment an account belongs to.
  await res.body?.cancel();
  return { ok: false, retryOtherEnv: res.status === 404 };
}

/**
 * Reads live subscription state for one original_transaction_id, trying
 * production first and falling back to sandbox on a 404.
 */
export async function readAppleSubscription(
  originalTransactionId: string,
): Promise<AppleSubscriptionResult> {
  const privateKey = Deno.env.get("APPLE_IAP_PRIVATE_KEY") ?? "";
  const keyId = Deno.env.get("APPLE_IAP_KEY_ID") ?? "";
  const issuerId = Deno.env.get("APPLE_IAP_ISSUER_ID") ?? "";
  if (!privateKey || !keyId || !issuerId) return { ok: false, reason: "not_configured" };

  let token: string;
  try {
    token = await buildAppleJwt(privateKey, keyId, issuerId);
  } catch {
    return { ok: false, reason: "not_configured" };
  }

  let environment: AppleEnvironment = "production";
  let result = await fetchStatuses(environment, originalTransactionId, token);
  if (!result.ok && result.retryOtherEnv) {
    environment = "sandbox";
    result = await fetchStatuses(environment, originalTransactionId, token);
    if (!result.ok) {
      return { ok: false, reason: result.retryOtherEnv ? "not_found" : "unavailable" };
    }
  }
  if (!result.ok) return { ok: false, reason: "unavailable" };

  const transactions = result.body.data?.[0]?.lastTransactions ?? [];
  // Prefer the entry for the id we asked about; Apple can return siblings in
  // the same subscription group.
  const tx = transactions.find((t) => t.originalTransactionId === originalTransactionId) ??
    transactions[0];
  if (!tx || typeof tx.status !== "number") return { ok: false, reason: "not_found" };

  let productId: string | null = null;
  let expiresAt: string | null = null;
  if (tx.signedTransactionInfo) {
    const verified = await verifyAppleJws<TransactionPayload>(tx.signedTransactionInfo);
    if (!verified.ok) return { ok: false, reason: "untrusted" };
    // A payload for another app must never drive our eligibility decision.
    if (verified.payload.bundleId && verified.payload.bundleId !== BUNDLE_ID) {
      return { ok: false, reason: "untrusted" };
    }
    productId = verified.payload.productId ?? null;
    expiresAt = verified.payload.expiresDate
      ? new Date(verified.payload.expiresDate).toISOString()
      : null;
  }

  let autoRenewStatus: number | null = null;
  let autoRenewProductId: string | null = null;
  let renewalOfferIdentifier: string | null = null;
  let renewalOfferType: number | null = null;
  if (tx.signedRenewalInfo) {
    const verified = await verifyAppleJws<RenewalPayload>(tx.signedRenewalInfo);
    if (!verified.ok) return { ok: false, reason: "untrusted" };
    autoRenewStatus = typeof verified.payload.autoRenewStatus === "number"
      ? verified.payload.autoRenewStatus
      : null;
    autoRenewProductId = verified.payload.autoRenewProductId ?? null;
    renewalOfferIdentifier = verified.payload.offerIdentifier ?? null;
    renewalOfferType = typeof verified.payload.offerType === "number"
      ? verified.payload.offerType
      : null;
  }

  return {
    ok: true,
    state: {
      environment,
      status: tx.status,
      productId,
      expiresAt,
      autoRenewStatus,
      autoRenewProductId,
      renewalOfferIdentifier,
      renewalOfferType,
    },
  };
}
