import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReferralCadence } from '@/lib/referral';

// Deliberately a separate key from the creator promo stash. The two must never
// share one: signup treats a pending creator code as something it can redeem
// for an entitlement and THROWS if redemption fails, so a referral code
// landing in that slot would break signup outright.
const PENDING_CLAIM_KEY = '@relentless/pending_referral_claim';

/**
 * A referral code entered on the paywall BEFORE the user had an account.
 *
 * It cannot be claimed yet: claiming binds the code to a user_id, which is
 * what makes attribution possible, so an account has to exist first. The code
 * and the chosen cadence are stashed here, the user creates an account, and
 * the paywall resumes the flow when they return to it signed in.
 */
export type PendingReferralClaim = {
  code: string;
  cadence: ReferralCadence;
  savedAt: string;
};

export async function savePendingReferralClaim(pending: PendingReferralClaim): Promise<void> {
  await AsyncStorage.setItem(PENDING_CLAIM_KEY, JSON.stringify(pending)).catch(() => {});
}

export async function loadPendingReferralClaim(): Promise<PendingReferralClaim | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_CLAIM_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.code === 'string' &&
      parsed.code.length > 0 &&
      (parsed.cadence === 'monthly' || parsed.cadence === 'annual')
    ) {
      return parsed as PendingReferralClaim;
    }
    return null;
  } catch {
    return null;
  }
}

export async function clearPendingReferralClaim(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_CLAIM_KEY).catch(() => {});
}

// Separate key again: an App Store Connect offer code is neither a creator
// code nor a referral claim, and must not be mistaken for either on resume.
const PENDING_APPLE_CODE_KEY = '@relentless/pending_apple_offer_code';

/**
 * An App Store Connect offer code entered on the paywall before the user had
 * an account. Redeeming it starts the subscription, so it waits until the
 * account exists and the paywall reopens Apple's sheet with it.
 */
export async function savePendingAppleOfferCode(code: string): Promise<void> {
  await AsyncStorage.setItem(PENDING_APPLE_CODE_KEY, code).catch(() => {});
}

export async function loadPendingAppleOfferCode(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_APPLE_CODE_KEY);
    return raw && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

export async function clearPendingAppleOfferCode(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_APPLE_CODE_KEY).catch(() => {});
}
