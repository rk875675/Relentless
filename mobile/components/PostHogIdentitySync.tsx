import { useEffect, useRef } from 'react';
import { analytics } from '@/lib/analytics';
import { useAuth } from '@/lib/auth-context';

/**
 * Identifies the PostHog person with the Supabase user id (no email / PII).
 * Keeps subscription + onboarding flags on the person record for cohorts / breakdowns.
 */
export function PostHogIdentitySync() {
  const {
    session,
    loading,
    entitlementStatus,
    onboardingComplete,
    hasPremiumAccess,
    isDevAccount,
  } = useAuth();
  const identifiedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (loading) return;

    const uid = session?.user?.id ?? null;
    if (!uid) {
      if (identifiedUserIdRef.current != null) {
        analytics.reset();
        identifiedUserIdRef.current = null;
      }
      return;
    }

    if (identifiedUserIdRef.current !== uid) {
      analytics.identify(uid);
      identifiedUserIdRef.current = uid;
    }

    analytics.setPersonProperties({
      entitlement_status: entitlementStatus ?? 'none',
      onboarding_completed: onboardingComplete,
      premium: hasPremiumAccess,
      is_dev_account: isDevAccount,
    });
    if (__DEV__) analytics.flush();
  }, [
    loading,
    session?.user?.id,
    entitlementStatus,
    onboardingComplete,
    hasPremiumAccess,
    isDevAccount,
  ]);

  return null;
}
