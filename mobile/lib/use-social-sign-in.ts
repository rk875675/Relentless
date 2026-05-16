import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth, type SocialSignInResult } from '@/lib/auth-context';
import { trackSigninStarted, trackSigninCompleted, trackSigninFailed } from '@/lib/lifecycle-analytics';

export function isSocialSignInCancelled(r: SocialSignInResult) {
  return r.ok === false && 'cancelled' in r && r.cancelled === true;
}

/**
 * Shared Google / Apple sign-in UX: same navigation and fallbacks as the auth hub.
 * See `mobile/docs/AUTH_SOCIAL_SIGNIN.md` before changing OAuth or this hook.
 */
export function useSocialSignIn() {
  const router = useRouter();
  const { signInWithGoogle, signInWithApple, session, onboardingComplete, hasPremiumAccess } = useAuth();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const attemptedSignIn = useRef(false);

  useEffect(() => {
    if (!session || !attemptedSignIn.current) return;
    if (onboardingComplete && hasPremiumAccess) {
      attemptedSignIn.current = false;
      router.replace('/(tabs)');
      return;
    }
    if (onboardingComplete && !hasPremiumAccess) {
      attemptedSignIn.current = false;
      router.replace('/(onboarding)/paywall');
      return;
    }
    // Session exists, but profile/entitlement state has not resolved yet. Do
    // not guess "welcome" here: slow reviewer networks can make returning
    // Apple users look incomplete and bounce them back to the welcome screen.
  }, [session, onboardingComplete, hasPremiumAccess, router]);

  const handleSocialSignIn = useCallback(
    async (provider: () => Promise<SocialSignInResult>, setLoading: (v: boolean) => void, method: string) => {
      setLoading(true);
      attemptedSignIn.current = true;
      trackSigninStarted({ method });
      try {
        const r = await provider();
        if (isSocialSignInCancelled(r)) {
          attemptedSignIn.current = false;
          return;
        }
        if (!r.ok) {
          attemptedSignIn.current = false;
          trackSigninFailed({ method, reason: ('error' in r && r.error) ? r.error : 'unknown' });
          if (!isSocialSignInCancelled(r) && 'error' in r && r.error) {
            Alert.alert('Could not sign in', r.error);
          }
          return;
        }
        trackSigninCompleted({ method });
        if (r.path) {
          attemptedSignIn.current = false;
          router.replace(r.path as any);
          return;
        }
      } catch (e) {
        attemptedSignIn.current = false;
        trackSigninFailed({ method, reason: e instanceof Error ? e.message : 'exception' });
        Alert.alert(
          'Could not sign in',
          e instanceof Error ? e.message : 'Something went wrong. Try again.',
        );
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  const handleGoogle = useCallback(
    () => handleSocialSignIn(signInWithGoogle, setGoogleLoading, 'google'),
    [handleSocialSignIn, signInWithGoogle],
  );

  const handleApple = useCallback(
    () => handleSocialSignIn(signInWithApple, setAppleLoading, 'apple'),
    [handleSocialSignIn, signInWithApple],
  );

  return {
    googleLoading,
    appleLoading,
    socialBusy: googleLoading || appleLoading,
    handleGoogle,
    handleApple,
  };
}
