import { Platform } from 'react-native';
import { apiFetch } from '@/lib/api';

// ---------------------------------------------------------------------------
// Referral offer — invitee side (PRD 10.5.4).
//
// Redeeming an Apple offer code IS the subscription purchase: the invitee does
// not redeem a code and then also buy through the paywall.
//
// The code is claimed server-side BEFORE Apple's redemption sheet is shown,
// because Apple never discloses which individual code was redeemed — it
// reports only the batch's offer reference name. Binding at claim time is the
// only thing that makes attribution possible (PRD 10.5.5).
// ---------------------------------------------------------------------------

export const REFERRAL_FLAG_KEY = 'referral_offer_enabled';

export type ReferralCadence = 'monthly' | 'annual';

export type ClaimReferralResult =
  | {
      ok: true;
      /**
       * The code the invitee must actually redeem. NOT necessarily the string
       * they typed: if they chose the other cadence, the server issues the
       * code for that plan instead.
       */
      code: string;
      productId: string;
      /** True when this user already claimed this invite — safe to re-present. */
      replay: boolean;
    }
  | { ok: false; errorCode: ReferralClaimErrorCode; message: string | null };

/**
 * INVALID_CODE deliberately covers unknown, exhausted, expired and wrong-type
 * codes alike, so the response never reveals which code system was probed
 * (PRD 10.5.7).
 */
export type ReferralClaimErrorCode =
  | 'INVALID_CODE'
  | 'SELF_SHARE'
  | 'RECIPROCITY_BLOCKED'
  | 'ALREADY_RECEIVED'
  | 'POOL_UNAVAILABLE'
  | 'FEATURE_DISABLED'
  | 'RATE_LIMITED'
  | 'NETWORK';

const FLAG_TTL_MS = 5 * 60 * 1000;
let _flagCache: { value: boolean; at: number } | null = null;

/**
 * Cheap client-side gate. The server is still authoritative on every call;
 * this only decides whether to show a surface at all.
 *
 * Read from /referral/config rather than /config because the invitee reaches
 * the paywall BEFORE creating an account, and /config requires a token — so a
 * flag read through it would always come back false for exactly the user who
 * needs this path most. Uses the publishable anon key, same as any other
 * pre-auth call.
 */
export async function isReferralEnabled(): Promise<boolean> {
  const now = Date.now();
  if (_flagCache && now - _flagCache.at < FLAG_TTL_MS) return _flagCache.value;

  const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (!baseUrl || !anonKey) return false;

  try {
    const res = await fetch(`${baseUrl}/functions/v1/referral/config`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    });
    if (!res.ok) return false;
    const json = await res.json();
    const value = json?.data?.enabled === true;
    _flagCache = { value, at: now };
    return value;
  } catch {
    // Failing closed keeps the feature invisible rather than half-present.
    return false;
  }
}

/**
 * Shape filter matching the offer-code import validator, so an obvious
 * mistyped creator code fails immediately instead of being walked through a
 * plan picker only to be rejected.
 *
 * This is NOT how the two code systems are told apart — creator codes have no
 * reserved format, so precedence stays with whichever table owns the code.
 * Every string Apple could have issued still passes this filter.
 */
export function looksLikeOfferCode(code: string): boolean {
  return /^[A-Za-z0-9]{6,24}$/.test(code.trim());
}

export async function claimReferralCode(
  code: string,
  cadence: ReferralCadence,
): Promise<ClaimReferralResult> {
  const { data, error, errorCode } = await apiFetch<{
    claimed: boolean;
    replay: boolean;
    code: string;
    product_id: string;
    apple_expires_at: string | null;
  }>('/referral/claim', {
    method: 'POST',
    body: { code: code.trim(), cadence },
  });

  if (error || !data?.claimed || !data.code) {
    const known: ReferralClaimErrorCode[] = [
      'INVALID_CODE',
      'SELF_SHARE',
      'RECIPROCITY_BLOCKED',
      'ALREADY_RECEIVED',
      'POOL_UNAVAILABLE',
      'FEATURE_DISABLED',
      'RATE_LIMITED',
    ];
    const matched = known.find((c) => c === errorCode);
    return { ok: false, errorCode: matched ?? 'NETWORK', message: error ?? null };
  }

  return {
    ok: true,
    code: data.code,
    productId: data.product_id,
    replay: data.replay === true,
  };
}

/**
 * Loads `expo-iap` lazily so dev/web bundles without the native module never
 * try to evaluate it. Mirrors lib/iap-restore.ts.
 */
function loadExpoIap(): typeof import('expo-iap') | null {
  if (Platform.OS !== 'ios') return null;
  try {
    return require('expo-iap') as typeof import('expo-iap');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Referral offer — sharer side (PRD 10.5.3, 10.5.6)
// ---------------------------------------------------------------------------

export type ReferralInvite = {
  id: string;
  status: 'open' | 'claimed' | 'converted' | string;
  /** Present only while the invite is open; that is the string to hand out. */
  code: string | null;
  invitee_product_id: string;
  created_at: string;
  ttl_expires_at: string;
  claimed_at: string | null;
  converted_at: string | null;
};

export type ReferralReward = {
  status: 'pending' | 'ready' | 'applied' | 'expired' | 'void' | string;
  product_id: string;
  ready_at: string | null;
  /** The specific invite whose conversion earned this reward. */
  invite_id: string | null;
};

export type ReferralState = {
  enabled: boolean;
  eligible: boolean;
  /** Machine-readable; the UI maps it to copy rather than showing it. */
  reason: string | null;
  cadence: 'monthly' | 'annual' | null;
  product_id: string | null;
  period_end: string | null;
  open_invites: number;
  max_open_invites: number;
  invite_ttl_days: number;
  has_active_renewal_offer: boolean;
  /** One Relentless code the sharer reuses. Each claim mints an Apple code. */
  share_code: string | null;
  reward: ReferralReward | null;
  invites: ReferralInvite[];
};

export type ReferralHomeBadgeText = 'GET 20% OFF' | 'CLAIM 20% OFF';

export type ReferralHomeBadge =
  | { visible: false }
  | { visible: true; text: ReferralHomeBadgeText };

/**
 * Home-badge visibility from server eligibility — not lifetime invite history.
 *
 *   CLAIM — reward is ready and Apple will still accept an apply
 *   hidden — this period's reward is used / blocked (applied, slot used,
 *            or an offer already on the renewal)
 *   GET    — otherwise
 *
 * Latest reward `applied` alone is not enough: that row can be from a prior
 * period. `give_slot_used` is the current-period signal.
 */
export function deriveReferralHomeBadge(state: ReferralState): ReferralHomeBadge {
  if (!state.enabled) return { visible: false };

  const rewardStatus = state.reward?.status ?? null;
  const cannotApply = state.has_active_renewal_offer;
  const slotUsedThisPeriod = state.reason === 'give_slot_used';

  if (state.reason === 'trial_not_paid') return { visible: false };

  if (rewardStatus === 'ready' && !cannotApply) {
    return { visible: true, text: 'CLAIM 20% OFF' };
  }

  // No GET/CLAIM if they cannot actually receive 20% this cycle: slot used,
  // or Apple already has an offer on the next renewal (cannot stack).
  if (slotUsedThisPeriod || cannotApply || state.reason === 'renewal_offer_active') {
    return { visible: false };
  }

  if (!state.eligible || !state.share_code) {
    return { visible: false };
  }

  return { visible: true, text: 'GET 20% OFF' };
}

/**
 * Eligibility is computed server-side only; the client never decides it and
 * never marks a billing period as used (PRD 10.5.3).
 */
export async function fetchReferralState(): Promise<ReferralState | null> {
  const { data, error } = await apiFetch<ReferralState>('/referral/eligibility');
  if (error || !data) return null;
  return { ...data, share_code: data.share_code ?? null };
}

export type CreateInviteResult =
  | { ok: true; code: string; inviteeProductId: string; ttlExpiresAt: string }
  | { ok: false; errorCode: string | null; message: string | null };

export async function createReferralInvite(): Promise<CreateInviteResult> {
  const { data, error, errorCode } = await apiFetch<{
    invite_id: string;
    code: string;
    /** The SKU the invitee will be sold. Named product_id on the wire. */
    product_id: string;
    ttl_expires_at: string;
    apple_expires_at: string | null;
    open_invites: number;
    max_open_invites: number;
  }>('/referral/invites', { method: 'POST' });

  if (error || !data?.code) {
    return { ok: false, errorCode: errorCode ?? null, message: error ?? null };
  }
  return {
    ok: true,
    code: data.code,
    inviteeProductId: data.product_id,
    ttlExpiresAt: data.ttl_expires_at,
  };
}

export type ApplyRewardResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'cancelled'
        | 'no_reward_ready'
        | 'already_applied'
        | 'offer_already_active'
        | 'not_eligible'
        | 'not_active'
        | 'auto_renew_off'
        | 'unavailable'
        | 'sdk_unavailable'
        | 'already_owned'
        | 'purchase_failed';
      detail?: string;
    };

/** Apple's ErrorCode.UserCancelled, plus the legacy StoreKit 1 spelling. */
function isCancellation(err: unknown): boolean {
  const code = (err as { code?: unknown })?.code;
  return code === 'user-cancelled' || code === 'E_USER_CANCELLED';
}

/** StoreKit refused a second buy of a SKU this Apple ID already subscribes to. */
function isAlreadyOwned(err: unknown): boolean {
  const code = String((err as { code?: unknown })?.code ?? '').toLowerCase();
  const message = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
  return (
    code === 'already-owned' ||
    code === 'e_already_owned' ||
    code.includes('already_owned') ||
    message.includes('already owned')
  );
}

/**
 * Finishes one transaction, retrying once, and never throwing.
 *
 * Isolating each finish matters: the purchase has already gone through by this
 * point, so one failure must not abandon the remaining transactions, and it
 * must not escape into the caller's error path either — that would report a
 * completed purchase as failed and invite the user to buy again.
 */
async function finishQuietly(
  iap: NonNullable<ReturnType<typeof loadExpoIap>>,
  purchase: Parameters<typeof iap.finishTransaction>[0]['purchase'],
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      // isConsumable false: this is an auto-renewing subscription.
      await iap.finishTransaction({ purchase, isConsumable: false });
      return true;
    } catch {
      // fall through to the retry
    }
  }
  return false;
}

/**
 * Applies the sharer's earned reward by buying their own subscription with a
 * server-signed promotional offer attached.
 *
 * This is the app's only purchase path outside Superwall. Two things matter:
 *
 *  - Every signed parameter comes from the server. The signature is bound to
 *    the product, the offer, the nonce and the timestamp, so nothing here may
 *    be substituted or the purchase is rejected as an invalid signature.
 *  - The transaction MUST be finished. An unfinished purchase stays in
 *    StoreKit's queue and would be the newest entry in getAvailablePurchases(),
 *    so it would be swept up by entitlement auto-restore (PRD 10.5.10).
 *
 * Success here does NOT mean the discount is applied. Apple applies the offer
 * at the next billing event, and the reward is marked applied only when Apple
 * confirms it on the renewal (PRD 10.5.6).
 */
export async function applySharerReward(): Promise<ApplyRewardResult> {
  const iap = loadExpoIap();
  if (!iap) return { ok: false, reason: 'sdk_unavailable' };

  const { data, error, errorCode } = await apiFetch<{
    reward_id: string;
    product_id: string;
    offer_identifier: string;
    key_identifier: string;
    nonce: string;
    timestamp: number;
    signature: string;
    app_account_token: string;
  }>('/referral/offer-signature', { method: 'POST' });

  if (error || !data?.signature) {
    switch (errorCode) {
      case 'NO_REWARD_READY':
        return { ok: false, reason: 'no_reward_ready' };
      case 'ALREADY_APPLIED':
        return { ok: false, reason: 'already_applied' };
      case 'OFFER_ALREADY_ACTIVE':
        return { ok: false, reason: 'offer_already_active' };
      case 'NOT_ELIGIBLE':
        return { ok: false, reason: 'not_eligible' };
      case 'SUBSCRIPTION_NOT_ACTIVE':
        return { ok: false, reason: 'not_active' };
      case 'AUTO_RENEW_OFF':
        return { ok: false, reason: 'auto_renew_off' };
      default:
        return { ok: false, reason: 'unavailable' };
    }
  }

  try {
    await iap.initConnection();

    // StoreKit needs the product loaded before it can be purchased.
    const productsRaw = await iap.fetchProducts({ skus: [data.product_id], type: 'subs' });
    const products = Array.isArray(productsRaw)
      ? productsRaw
      : Array.isArray((productsRaw as { products?: unknown[] } | null)?.products)
        ? (productsRaw as unknown as { products: unknown[] }).products
        : [];
    if (products.length === 0) {
      return { ok: false, reason: 'purchase_failed', detail: 'product_not_found' };
    }

    const withOffer = {
      identifier: data.offer_identifier,
      keyIdentifier: data.key_identifier,
      nonce: data.nonce,
      signature: data.signature,
      // OpenIAP 2.1.2 decodes timestamp as an Int. A string can drop withOffer
      // so the purchase looks like a second buy of a plan they already own.
      timestamp: data.timestamp,
    };
    const appleRequest = {
      sku: data.product_id,
      withOffer,
      // Must match the UUID folded into the server signature.
      appAccountToken: data.app_account_token,
    };

    const result = await iap.requestPurchase({
      type: 'subs',
      request: {
        apple: appleRequest,
        ios: appleRequest,
      },
    });

    let purchases = Array.isArray(result) ? result : result ? [result] : [];
    if (purchases.length === 0) {
      // StoreKit 2 / expo-iap sometimes returns [] for a completed
      // subscription offer. Treat a fresh receipt for this SKU as success.
      try {
        const available = (await iap.getAvailablePurchases()) as Array<{
          productId?: string;
          transactionDate?: number;
        }>;
        const cutoff = Date.now() - 120_000;
        purchases = (available ?? []).filter(
          (p) => p.productId === data.product_id && (p.transactionDate ?? 0) >= cutoff,
        ) as typeof purchases;
      } catch {
        purchases = [];
      }
      if (purchases.length === 0) {
        return { ok: false, reason: 'purchase_failed', detail: 'empty_purchase' };
      }
    }

    let unfinished = 0;
    for (const purchase of purchases) {
      if (!(await finishQuietly(iap, purchase))) unfinished += 1;
    }

    if (unfinished > 0) {
      // Worth surfacing: an unfinished transaction is the leak PRD 10.5.10
      // warns about. The purchase itself still succeeded, so this is reported
      // as success rather than prompting the user to buy again.
      console.warn('[referral] promotional offer purchase left transactions unfinished', {
        unfinished,
      });
    }

    return { ok: true };
  } catch (err) {
    if (isCancellation(err)) return { ok: false, reason: 'cancelled' };
    if (isAlreadyOwned(err)) {
      // Same-SKU promotional offers often throw this because Apple will not
      // sell the plan again. If the offer actually landed on the renewal,
      // treat it as sent — do not claim the next charge is discounted.
      const state = await fetchReferralState().catch(() => null);
      if (state?.has_active_renewal_offer) return { ok: true };
      return { ok: false, reason: 'already_owned' };
    }
    const code = (err as { code?: unknown })?.code;
    const message = err instanceof Error ? err.message : null;
    console.warn('[referral] promotional offer purchase failed', { code, message });
    return { ok: false, reason: 'purchase_failed' };
  }
}

/**
 * Presents Apple's offer-code redemption sheet.
 *
 * Apple's API takes no arguments and CANNOT be pre-filled, so the invitee has
 * to enter the code into Apple's own UI. That is why the caller shows the
 * issued code first and puts it on the clipboard.
 *
 * Redeeming here starts the subscription. Nothing is reported back: Apple
 * neither returns a result nor says which code was used, so the reward is
 * released from the server-side notification, never from this call.
 */
export async function presentAppleOfferCodeSheet(): Promise<boolean> {
  const iap = loadExpoIap();
  if (!iap) return false;

  try {
    await iap.initConnection();
    await iap.presentCodeRedemptionSheetIOS();
    return true;
  } catch {
    return false;
  }
}

/** Newest StoreKit transactionDate on this device, or 0. */
export async function latestStoreKitPurchaseAt(): Promise<number> {
  const iap = loadExpoIap();
  if (!iap) return 0;
  try {
    await iap.initConnection();
    const purchases = (await iap.getAvailablePurchases()) as Array<{ transactionDate?: number }>;
    if (!Array.isArray(purchases)) return 0;
    return purchases.reduce((max, p) => Math.max(max, p.transactionDate ?? 0), 0);
  } catch {
    return 0;
  }
}

/**
 * Offer-code redeem often skips purchaseUpdatedListener. Subscribe anyway so
 * a purchase that does emit can leave the redeem pane immediately.
 */
export function watchStoreKitPurchases(onPurchase: () => void): () => void {
  const iap = loadExpoIap();
  const subscribe = (
    iap as { purchaseUpdatedListener?: (cb: () => void) => { remove: () => void } } | null
  )?.purchaseUpdatedListener;
  if (!subscribe) return () => {};
  try {
    const sub = subscribe(() => {
      onPurchase();
    });
    return () => {
      try {
        sub.remove();
      } catch {
        /* listener already gone */
      }
    };
  } catch {
    return () => {};
  }
}

/**
 * Ask the server to reconcile a pending offer-code subscription.
 *
 * The client cannot reliably determine the correct OTID after an offer-code
 * redemption (StoreKit sandbox shares purchases across Apple IDs on the same
 * device). This endpoint resolves it server-side by matching the user's
 * claimed invite to the Apple notification log, updating the entitlement,
 * and firing the reward release.
 *
 * Returns `true` when the entitlement was successfully set to active.
 */
export async function reconcileReferralPurchase(): Promise<boolean> {
  const { data, error } = await apiFetch<{ reconciled: boolean; status?: string }>(
    '/referral/reconcile',
    { method: 'POST' },
  );
  if (error || !data) return false;
  return data.reconciled === true && (data.status === 'active' || data.status === 'trial');
}
