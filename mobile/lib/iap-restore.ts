import { Platform } from 'react-native';
import { syncSubscriptionWithBackend } from '@/lib/purchases-sync';

export type RestoreResult =
  | { ok: true; productId: string | null; entitlementStatus: string }
  | { ok: false; reason: 'no_purchases' | 'no_original_tx_id' | 'unsupported_platform' | 'sync_failed' | 'sdk_unavailable'; error?: string };

type IosPurchaseLike = {
  productId?: string | null;
  originalTransactionIdentifierIOS?: string | null;
  transactionDate?: number | null;
  expirationDateIOS?: number | null;
};

/**
 * Loads `expo-iap` lazily so dev/web bundles without the native module never try to evaluate it.
 * Returns `null` if the module can't be loaded (e.g. Expo Go, web).
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
 * Real Apple-compliant restore for the in-shell Restore button.
 *
 * 1. Open StoreKit 2 connection.
 * 2. Read the user's available purchases from this Apple ID.
 * 3. Pick the most recent iOS subscription transaction and grab its
 *    `originalTransactionIdentifierIOS`.
 * 4. POST it to `/purchases/restore` (same backend path Superwall already uses
 *    for `transactionRestore` / `transactionComplete`) so the server can verify
 *    with Apple and update `entitlements`.
 *
 * Caller is expected to call `refreshUserState()` after a successful return so
 * the React tree picks up the updated entitlement and the existing route guard
 * navigates the user out of the paywall.
 */
export async function restorePurchasesViaStoreKit(): Promise<RestoreResult> {
  if (Platform.OS !== 'ios') {
    return { ok: false, reason: 'unsupported_platform' };
  }

  const iap = loadExpoIap();
  if (!iap) {
    return { ok: false, reason: 'sdk_unavailable' };
  }

  try {
    await iap.initConnection();
  } catch (e) {
    return { ok: false, reason: 'sdk_unavailable', error: e instanceof Error ? e.message : String(e) };
  }

  try {
    const purchases = (await iap.getAvailablePurchases()) as unknown as IosPurchaseLike[];
    if (!Array.isArray(purchases) || purchases.length === 0) {
      return { ok: false, reason: 'no_purchases' };
    }

    // Prefer the purchase with the latest transactionDate that has an originalTransactionIdentifierIOS.
    const sorted = [...purchases]
      .filter((p) => typeof p.originalTransactionIdentifierIOS === 'string' && p.originalTransactionIdentifierIOS.length > 0)
      .sort((a, b) => (b.transactionDate ?? 0) - (a.transactionDate ?? 0));

    const latest = sorted[0];
    if (!latest || !latest.originalTransactionIdentifierIOS) {
      return { ok: false, reason: 'no_original_tx_id' };
    }

    const sync = await syncSubscriptionWithBackend(latest.originalTransactionIdentifierIOS);
    if (!sync.ok) {
      return { ok: false, reason: 'sync_failed', error: sync.error ?? 'Unknown sync error' };
    }

    return { ok: true, productId: latest.productId ?? null, entitlementStatus: 'active' };
  } catch (e) {
    return { ok: false, reason: 'sync_failed', error: e instanceof Error ? e.message : String(e) };
  }
}
