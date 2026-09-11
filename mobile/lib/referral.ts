import { Platform } from 'react-native';
import { apiFetch } from '@/lib/api';
import { isFeatureFlagEnabled } from '@/lib/config-flags';

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

/** Cheap client-side gate. The server is still authoritative on every call. */
export async function isReferralEnabled(): Promise<boolean> {
  return isFeatureFlagEnabled(REFERRAL_FLAG_KEY);
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
  reward: ReferralReward | null;
  invites: ReferralInvite[];
};

/**
 * Eligibility is computed server-side only; the client never decides it and
 * never marks a billing period as used (PRD 10.5.3).
 */
export async function fetchReferralState(): Promise<ReferralState | null> {
  const { data, error } = await apiFetch<ReferralState>('/referral/eligibility');
  if (error || !data) return null;
  return data;
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
        | 'unavailable'
        | 'sdk_unavailable'
        | 'purchase_failed';
    };

/** Apple's ErrorCode.UserCancelled, plus the legacy StoreKit 1 spelling. */
function isCancellation(err: unknown): boolean {
  const code = (err as { code?: unknown })?.code;
  return code === 'user-cancelled' || code === 'E_USER_CANCELLED';
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
      case 'SUBSCRIPTION_NOT_ACTIVE':
      case 'AUTO_RENEW_OFF':
        return { ok: false, reason: 'not_eligible' };
      default:
        return { ok: false, reason: 'unavailable' };
    }
  }

  try {
    await iap.initConnection();

    // StoreKit needs the product loaded before it can be purchased.
    const products = await iap.fetchProducts({ skus: [data.product_id], type: 'subs' });
    if (!Array.isArray(products) || products.length === 0) {
      return { ok: false, reason: 'purchase_failed' };
    }

    const result = await iap.requestPurchase({
      type: 'subs',
      request: {
        apple: {
          sku: data.product_id,
          withOffer: {
            identifier: data.offer_identifier,
            keyIdentifier: data.key_identifier,
            nonce: data.nonce,
            signature: data.signature,
            timestamp: data.timestamp,
          },
        },
      },
    });

    const purchases = Array.isArray(result) ? result : result ? [result] : [];
    if (purchases.length === 0) {
      // iOS returns an empty array for subscriptions when nothing completed.
      return { ok: false, reason: 'purchase_failed' };
    }

    for (const purchase of purchases) {
      // isConsumable false: this is an auto-renewing subscription.
      await iap.finishTransaction({ purchase, isConsumable: false });
    }

    return { ok: true };
  } catch (err) {
    if (isCancellation(err)) return { ok: false, reason: 'cancelled' };
    console.warn('[referral] promotional offer purchase failed', {
      code: (err as { code?: unknown })?.code ?? null,
    });
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
