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
  gracePeriodExpiresDate?: number;
};

type TransactionInfo = {
  originalTransactionId?: string;
  bundleId?: string;
  productId?: string;
  isTrialPeriod?: boolean;
  is_trial_period?: boolean;
  offerDiscountType?: string;
  expiresDate?: number;
  revocationDate?: number;
};

// ---------------------------------------------------------------------------
// Entitlement status mapping (mirrors purchases/index.ts semantics:
// Apple BILLING_RETRY/BILLING_GRACE are treated as active)
// ---------------------------------------------------------------------------

type SyncedEntitlement = {
  status: "trial" | "active" | "expired";
  expiresAt: string | null;
};

function isFreeTrialTx(txInfo: TransactionInfo): boolean {
  return (
    txInfo.isTrialPeriod === true ||
    txInfo.is_trial_period === true ||
    txInfo.offerDiscountType?.toUpperCase() === "FREE_TRIAL"
  );
}

function computeSyncedEntitlement(
  notificationType: string,
  txInfo: TransactionInfo,
  renewalInfo: RenewalInfo | null,
): SyncedEntitlement {
  if (notificationType === "REFUND" || notificationType === "REVOKE") {
    return {
      status: "expired",
      expiresAt: new Date(txInfo.revocationDate ?? Date.now()).toISOString(),
    };
  }

  if (notificationType === "EXPIRED" || notificationType === "GRACE_PERIOD_EXPIRED") {
    return {
      status: "expired",
      expiresAt: txInfo.expiresDate
        ? new Date(txInfo.expiresDate).toISOString()
        : new Date().toISOString(),
    };
  }

  if (notificationType === "DID_FAIL_TO_RENEW") {
    // Billing retry / billing grace. purchases/restore treats both as active,
    // so keep access here too. requireEntitlement denies any row whose
    // expires_at is in the past, so we must NOT leave the lapsed expiry in
    // place: use the grace-period end when Apple provides one, otherwise null
    // (Apple always follows up with DID_RENEW or EXPIRED, which resolves it).
    return {
      status: "active",
      expiresAt: renewalInfo?.gracePeriodExpiresDate
        ? new Date(renewalInfo.gracePeriodExpiresDate).toISOString()
        : null,
    };
  }

  // Everything else (SUBSCRIBED, DID_RENEW, OFFER_REDEEMED, RENEWAL_EXTENDED,
  // REFUND_REVERSED, DID_CHANGE_RENEWAL_PREF, DID_CHANGE_RENEWAL_STATUS, ...):
  // recompute from the latest transaction's expiry, same as purchases/index.ts.
  const isActive = txInfo.expiresDate ? txInfo.expiresDate > Date.now() : false;
  return {
    status: isActive ? (isFreeTrialTx(txInfo) ? "trial" : "active") : "expired",
    expiresAt: txInfo.expiresDate ? new Date(txInfo.expiresDate).toISOString() : null,
  };
}

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

  const subtype = notification.subtype ?? "";
  console.log("[apple-notifications]", notificationType ?? "(unknown)", subtype);

  // Superwall must receive EVERY notification regardless of what we do with it.
  // Collected async work (forward + analytics) is awaited together before
  // returning 200, so nothing is orphaned by runtime termination.
  const pendingWork: Promise<unknown>[] = [forwardToSuperwall(rawBody)];

  // Both inner JWS blobs live inside the Apple-verified outer payload, so
  // decode-only (no second signature check) is sound here.
  const txInfo = data?.signedTransactionInfo
    ? decodeJwtPayload<TransactionInfo>(data.signedTransactionInfo)
    : null;
  const renewalInfo = data?.signedRenewalInfo
    ? decodeJwtPayload<RenewalInfo>(data.signedRenewalInfo)
    : null;

  const originalTransactionId =
    txInfo?.originalTransactionId ?? renewalInfo?.originalTransactionId ?? null;

  if (!originalTransactionId || (txInfo?.bundleId && txInfo.bundleId !== BUNDLE_ID)) {
    // Nothing we can act on (e.g. TEST notification) — forward only.
    await Promise.allSettled(pendingWork);
    return new Response("OK", { status: 200 });
  }

  // Look up the owning user via the indexed original_transaction_id column.
  const supabase = createServiceClient();
  const { data: entRow } = await supabase
    .from("entitlements")
    .select("user_id, status, expires_at")
    .eq("original_transaction_id", originalTransactionId)
    .maybeSingle();

  if (!entRow?.user_id) {
    console.warn(
      "[apple-notifications] No entitlement row for originalTransactionId",
      originalTransactionId,
    );
    await Promise.allSettled(pendingWork);
    return new Response("OK", { status: 200 });
  }

  // -------------------------------------------------------------------------
  // Entitlement sync: write Apple's latest state to the database. This is what
  // keeps trial→paid conversions, renewals, expirations, refunds, revokes and
  // billing grace in sync so paying users are never locked out by a stale
  // expires_at (and lapsed users lose access without waiting for a restore).
  // -------------------------------------------------------------------------

  if (txInfo && notificationType) {
    const synced = computeSyncedEntitlement(notificationType, txInfo, renewalInfo);
    const productId =
      txInfo.productId ?? renewalInfo?.productId ?? renewalInfo?.autoRenewProductId ?? null;

    const { error: updateErr } = await supabase
      .from("entitlements")
      .update({
        status: synced.status,
        expires_at: synced.expiresAt,
        // Never blank out a known product_id with a payload that omits it.
        ...(productId ? { product_id: productId } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", entRow.user_id);

    if (updateErr) {
      console.error("[apple-notifications] Failed to update entitlement", {
        userId: entRow.user_id,
        notificationType,
        error: updateErr,
      });
    } else {
      console.log("[apple-notifications] Entitlement synced", {
        userId: entRow.user_id,
        notificationType,
        subtype,
        previousStatus: entRow.status,
        newStatus: synced.status,
        expiresAt: synced.expiresAt,
      });

      pendingWork.push(
        supabase.from("entitlement_events").insert({
          user_id: entRow.user_id,
          event_type: "apple_notification",
          product_id: productId,
          metadata: {
            notification_type: notificationType,
            subtype: subtype || null,
            previous_status: entRow.status,
            new_status: synced.status,
            expires_at: synced.expiresAt,
            original_transaction_id: originalTransactionId,
            environment: data?.environment ?? null,
          },
        }),
      );

      // Keep the PostHog person record accurate on every real state change so
      // dashboards segment on live subscription state, not launch-time state.
      if (synced.status !== entRow.status) {
        pendingWork.push(
          capturePostHogEvent(entRow.user_id, "subscription_state_synced", {
            notification_type: notificationType,
            subtype: subtype || null,
            previous_status: entRow.status,
            new_status: synced.status,
            product_id: productId,
            original_transaction_id: originalTransactionId,
            environment: data?.environment ?? null,
            $set: {
              entitlement_status: synced.status,
              premium: synced.status === "trial" || synced.status === "active",
            },
          }),
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // trial_cancelled analytics (pre-existing behavior, unchanged semantics):
  // user turned auto-renew OFF while in a free trial.
  // -------------------------------------------------------------------------

  if (
    notificationType === "DID_CHANGE_RENEWAL_STATUS" &&
    renewalInfo?.autoRenewStatus === 0
  ) {
    const inTrial = entRow.status === "trial" || (txInfo ? isFreeTrialTx(txInfo) : false);
    if (inTrial) {
      console.log("[apple-notifications] Firing trial_cancelled for user", entRow.user_id);
      pendingWork.push(
        capturePostHogEvent(entRow.user_id, "trial_cancelled", {
          product_id: renewalInfo.productId ?? renewalInfo.autoRenewProductId ?? null,
          original_transaction_id: originalTransactionId,
          is_trial: true,
          environment: data?.environment ?? null,
        }),
      );
    }
  }

  await Promise.allSettled(pendingWork);
  return new Response("OK", { status: 200 });
});
