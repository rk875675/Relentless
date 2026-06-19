import { createServiceClient } from "../_shared/supabase.ts";
import { verifyAppleJws, type AppleJwsResult } from "../_shared/apple_jws.ts";

// ---------------------------------------------------------------------------
// Apple App Store Server Notifications v2 — PostHog proxy
//
// This function sits BETWEEN Apple and Superwall:
//   Apple → this function → (1) PostHog events  (2) forward raw body to Superwall
//
// Set ONE URL in App Store Connect → Subscriptions → App Store Server Notifications
// for both Production and Sandbox:
//   https://tnetahaviblrrjixzvbd.supabase.co/functions/v1/apple-notifications
//
// Supabase secrets required (all already set):
//   POSTHOG_API_KEY              — PostHog project API key
//   POSTHOG_HOST                 — PostHog ingest host
//   SUPERWALL_APPLE_WEBHOOK_URL  — Superwall's full webhook URL (copied from App Store Connect)
// ---------------------------------------------------------------------------

const BUNDLE_ID = "com.relentlessmentaltoughness.relentless";

// ---------------------------------------------------------------------------
// JWS decode helper (matches purchases/index.ts — decode only, no sig verify)
// ---------------------------------------------------------------------------

function decodeJwtPayload<T>(jwt: string): T | null {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    return JSON.parse(atob(padded)) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// PostHog server-side capture
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
    // Analytics must never crash the webhook handler.
  }
}

// ---------------------------------------------------------------------------
// Forward the raw Apple payload to Superwall unchanged
// ---------------------------------------------------------------------------

async function forwardToSuperwall(rawBody: string): Promise<void> {
  const superwallUrl = Deno.env.get("SUPERWALL_APPLE_WEBHOOK_URL") ?? "";
  if (!superwallUrl) return;
  try {
    await fetch(superwallUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: rawBody,
    });
  } catch (err) {
    console.error("[apple-notifications] Superwall forward failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Apple notification payload types (App Store Server Notifications v2)
// ---------------------------------------------------------------------------

type NotificationPayload = {
  notificationType?: string;
  subtype?: string;
  version?: string;
  signedDate?: number;
  data?: {
    bundleId?: string;
    bundleVersion?: string;
    environment?: string;
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
  };
};

type RenewalInfo = {
  originalTransactionId?: string;
  productId?: string;
  autoRenewProductId?: string;
  autoRenewStatus?: number; // 0 = off (user cancelled), 1 = on
};

type TransactionInfo = {
  originalTransactionId?: string;
  bundleId?: string;
  productId?: string;
  isTrialPeriod?: boolean;
  is_trial_period?: boolean;
  offerDiscountType?: string;
  expiresDate?: number;
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Read as text so we can forward the exact raw bytes to Superwall.
  let rawBody: string;
  let body: unknown;
  try {
    rawBody = await req.text();
    body = JSON.parse(rawBody);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const signedPayload =
    body && typeof body === "object" && "signedPayload" in body
      ? (body as { signedPayload?: unknown }).signedPayload
      : undefined;

  if (typeof signedPayload !== "string") {
    // Still forward to Superwall even if we can't parse — don't drop their events.
    await forwardToSuperwall(rawBody);
    console.warn("[apple-notifications] Missing signedPayload");
    return new Response("OK", { status: 200 });
  }

  // Verify Apple's signature on the outer signedPayload before trusting or
  // acting on ANY of its contents. A payload whose Apple signature cannot be
  // verified is a forgery and is rejected.
  let verification: AppleJwsResult<NotificationPayload>;
  try {
    verification = await verifyAppleJws<NotificationPayload>(signedPayload);
  } catch (err) {
    // The verifier itself failed unexpectedly. Do NOT break Superwall's
    // pipeline (they verify Apple signatures independently): forward the raw
    // payload but do not act on it ourselves.
    console.error("[apple-notifications] verifier crashed; forwarding without acting", err);
    await forwardToSuperwall(rawBody);
    return new Response("OK", { status: 200 });
  }

  if (!verification.ok) {
    console.warn("[apple-notifications] Rejected: Apple signature could not be verified");
    return new Response("Unauthorized", { status: 401 });
  }

  const notification = verification.payload;

  const { notificationType, data } = notification;

  if (data?.bundleId && data.bundleId !== BUNDLE_ID) {
    console.warn("[apple-notifications] bundleId mismatch:", data.bundleId);
    return new Response("OK", { status: 200 });
  }

  console.log("[apple-notifications]", notificationType ?? "(unknown)", notification.subtype ?? "");

  // Forward to Superwall for ALL notification types — run in parallel with our logic.
  // Promise.allSettled ensures both complete before we return 200 to Apple, so
  // neither gets cut off by the edge function runtime.
  if (notificationType !== "DID_CHANGE_RENEWAL_STATUS" || !data?.signedRenewalInfo) {
    await forwardToSuperwall(rawBody);
    return new Response("OK", { status: 200 });
  }

  const renewalInfo = decodeJwtPayload<RenewalInfo>(data.signedRenewalInfo);
  if (!renewalInfo) {
    await forwardToSuperwall(rawBody);
    console.warn("[apple-notifications] Failed to decode signedRenewalInfo");
    return new Response("OK", { status: 200 });
  }

  // autoRenewStatus=1 means user re-enabled auto-renew — not a cancellation.
  if (renewalInfo.autoRenewStatus !== 0) {
    await forwardToSuperwall(rawBody);
    return new Response("OK", { status: 200 });
  }

  const originalTransactionId = renewalInfo.originalTransactionId;
  if (!originalTransactionId) {
    await forwardToSuperwall(rawBody);
    console.warn("[apple-notifications] No originalTransactionId in renewalInfo");
    return new Response("OK", { status: 200 });
  }

  // Determine whether the user is currently in a free trial from the transaction info.
  let isTrialPeriod = false;
  if (data.signedTransactionInfo) {
    const txInfo = decodeJwtPayload<TransactionInfo>(data.signedTransactionInfo);
    if (txInfo) {
      isTrialPeriod =
        txInfo.isTrialPeriod === true ||
        txInfo.is_trial_period === true ||
        txInfo.offerDiscountType?.toUpperCase() === "FREE_TRIAL";
    }
  }

  // Look up the owning user via the indexed original_transaction_id column.
  const supabase = createServiceClient();
  const { data: entRow } = await supabase
    .from("entitlements")
    .select("user_id, status")
    .eq("original_transaction_id", originalTransactionId)
    .maybeSingle();

  if (!entRow?.user_id) {
    // Still forward — Superwall may have its own user lookup.
    await forwardToSuperwall(rawBody);
    console.warn(
      "[apple-notifications] No entitlement row for originalTransactionId",
      originalTransactionId,
    );
    return new Response("OK", { status: 200 });
  }

  // Fire trial_cancelled only when the user is actually in a trial period.
  const inTrial = entRow.status === "trial" || isTrialPeriod;

  const productId = renewalInfo.productId ?? renewalInfo.autoRenewProductId ?? null;

  // Run PostHog capture and Superwall forward in parallel — both must complete
  // before we return 200 so neither is orphaned by runtime termination.
  if (inTrial) {
    console.log("[apple-notifications] Firing trial_cancelled for user", entRow.user_id);
    await Promise.allSettled([
      capturePostHogEvent(entRow.user_id, "trial_cancelled", {
        product_id: productId,
        original_transaction_id: originalTransactionId,
        is_trial: true,
        environment: data.environment ?? null,
      }),
      forwardToSuperwall(rawBody),
    ]);
  } else {
    console.log("[apple-notifications] Auto-renew disabled but not in trial — forwarding only", {
      dbStatus: entRow.status,
      isTrialPeriod,
    });
    await forwardToSuperwall(rawBody);
  }

  return new Response("OK", { status: 200 });
});
