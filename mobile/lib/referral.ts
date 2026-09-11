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
