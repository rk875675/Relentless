import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useAuth } from '@/lib/auth-context';
import { restorePurchasesViaStoreKit } from '@/lib/iap-restore';

/**
 * Silent self-heal for stale entitlement rows (Phase 0 safety net).
 *
 * If Apple renewed/converted a subscription but our database still holds the
 * old expires_at (e.g. the state change predates the apple-notifications
 * entitlement sync), the signed-in user looks expired and gets the paywall.
 * On launch, when the DB says a PREVIOUS subscriber has no access
 * (status trial/active with a lapsed date, or expired), quietly re-verify
 * with Apple through the existing /purchases/restore path and refresh state.
 *
 * - Runs at most once per app launch.
 * - No UI: failures (no StoreKit purchases, genuinely lapsed, sdk missing)
 *   are silent no-ops — the paywall stays, which is correct for those users.
 * - Skips status 'none' so a fresh account on a shared device is never
 *   silently linked to another account's Apple subscription.
 */
const RESTORABLE_STATUSES = ['trial', 'active', 'expired'];

export function EntitlementAutoRestore() {
  const { session, profileLoaded, hasPremiumAccess, isOptimisticGrant, entitlementStatus, refreshUserState } = useAuth();
  const attemptedThisLaunch = useRef(false);

  const shouldAttempt =
    Platform.OS === 'ios' &&
    !!session &&
    profileLoaded &&
    !hasPremiumAccess &&
    !isOptimisticGrant &&
    RESTORABLE_STATUSES.includes(entitlementStatus ?? '');

  useEffect(() => {
    if (!shouldAttempt || attemptedThisLaunch.current) return;
    attemptedThisLaunch.current = true;

    // Small delay so cold-start work (auth fetch, navigation) settles first.
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const result = await restorePurchasesViaStoreKit();
          if (result.ok) {
            if (__DEV__) console.log('[EntitlementAutoRestore] healed stale entitlement via silent restore');
            await refreshUserState();
          } else if (__DEV__) {
            console.log('[EntitlementAutoRestore] no-op:', result.reason);
          }
        } catch {
          // Silent by design — the user can always use the Restore button.
        }
      })();
    }, 2500);

    return () => clearTimeout(timer);
  }, [shouldAttempt, refreshUserState]);

  return null;
}
