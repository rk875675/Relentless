import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PromoCodeType } from '@/lib/promo-codes';

const PENDING_PROMO_KEY = '@relentless/pending_promo_code';

/**
 * A promo code validated on the paywall BEFORE the user had an account.
 * Stashed locally (same pattern as onboarding-local-state) and redeemed
 * server-side right after signup completes.
 */
export type PendingPromoCode = {
  code: string;
  type: PromoCodeType;
  months: number | null;
  creatorName: string | null;
  creatorSlug: string | null;
  validatedAt: string;
};

export async function savePendingPromoCode(pending: PendingPromoCode): Promise<void> {
  await AsyncStorage.setItem(PENDING_PROMO_KEY, JSON.stringify(pending)).catch(() => {});
}

export async function loadPendingPromoCode(): Promise<PendingPromoCode | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_PROMO_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.code === 'string' && parsed.code.length > 0) {
      return parsed as PendingPromoCode;
    }
    return null;
  } catch {
    return null;
  }
}

export async function clearPendingPromoCode(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_PROMO_KEY).catch(() => {});
}
