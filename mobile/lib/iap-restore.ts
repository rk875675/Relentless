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
  /** expo-iap's unified purchase token — on iOS this is the Apple-signed JWS. */
  purchaseToken?: string | null;
  transactionReceipt?: string | null;
  jwsRepresentation?: string | null;
  signedTransactionInfo?: string | null;
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

    const signedTx =
      (typeof latest.purchaseToken === 'string' && latest.purchaseToken) ||
      (typeof latest.signedTransactionInfo === 'string' && latest.signedTransactionInfo) ||
      (typeof latest.jwsRepresentation === 'string' && latest.jwsRepresentation) ||
      undefined;

    if (__DEV__) {
      const segments = signedTx?.split('.').length ?? 0;
      console.log('[iap-restore][jws]', { hasJws: Boolean(signedTx), segments, source: signedTx ? (latest.purchaseToken ? 'purchaseToken' : 'fallback') : 'none' });
    }

    const sync = await syncSubscriptionWithBackend(latest.originalTransactionIdentifierIOS, signedTx || undefined);
    if (!sync.ok) {
      return { ok: false, reason: 'sync_failed', error: sync.error ?? 'Unknown sync error' };
    }

    return { ok: true, productId: latest.productId ?? null, entitlementStatus: 'active' };
  } catch (e) {
    return { ok: false, reason: 'sync_failed', error: e instanceof Error ? e.message : String(e) };
  }
}

export type FetchJwsResult = {
  originalTransactionId: string;
  signedTransactionInfo: string;
} | undefined;

/**
 * Lightweight helper that fetches the Apple-signed JWS for a given
 * originalTransactionId (or the most recent purchase if none specified)
 * via expo-iap's getAvailablePurchases(). Returns undefined on any failure
 * so callers can degrade gracefully.
 */
export async function fetchJwsForTransaction(
  originalTransactionId?: string,
): Promise<FetchJwsResult> {
  if (Platform.OS !== 'ios') return undefined;

  const iap = loadExpoIap();
  if (!iap) return undefined;

  try {
    await iap.initConnection();
    const purchases = (await iap.getAvailablePurchases()) as unknown as IosPurchaseLike[];
    if (!Array.isArray(purchases) || purchases.length === 0) return undefined;

    const candidates = purchases
      .filter((p) => typeof p.originalTransactionIdentifierIOS === 'string' && p.originalTransactionIdentifierIOS.length > 0)
      .sort((a, b) => (b.transactionDate ?? 0) - (a.transactionDate ?? 0));

    const match = originalTransactionId
      ? candidates.find((p) => p.originalTransactionIdentifierIOS === originalTransactionId) ?? candidates[0]
      : candidates[0];

    if (!match?.originalTransactionIdentifierIOS) return undefined;

    const jws =
      (typeof match.purchaseToken === 'string' && match.purchaseToken) ||
      (typeof match.signedTransactionInfo === 'string' && match.signedTransactionInfo) ||
      (typeof match.jwsRepresentation === 'string' && match.jwsRepresentation) ||
      undefined;

    if (!jws) return undefined;

    return {
      originalTransactionId: match.originalTransactionIdentifierIOS,
      signedTransactionInfo: jws,
    };
  } catch {
    return undefined;
  }
}
