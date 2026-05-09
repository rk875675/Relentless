import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useGlobalSearchParams, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import { useEffect, useRef } from 'react';
import { AnalyticsScreenTracker } from '@/components/AnalyticsScreenTracker';
import { PostHogIdentitySync } from '@/components/PostHogIdentitySync';
import { PostHogRoot } from '@/components/PostHogRoot';
import { SuperwallRoot } from '@/components/SuperwallRoot';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { parseAuthParamsFromUrl } from '@/lib/auth-redirects';
import { clearInAppAuthHubEntry, takeInAppAuthHubEntry } from '@/lib/auth-hub-entry';
import { loadOnboardingProgress } from '@/lib/onboarding-local-state';

export { ErrorBoundary } from 'expo-router';

/** Root `app/index.tsx` redirects to welcome; this must be the default child or cold start can still open `(auth)`. */
export const unstable_settings = {
  initialRouteName: 'index',
};

SplashScreen.preventAutoHideAsync();

const SPLASH_SAFETY_MS = 4000;

function firstParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function RouteGuard() {
  const { session, loading, onboardingComplete, hasPremiumAccess, isOptimisticGrant, completeOnboarding } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const globalParams = useGlobalSearchParams();
  const authEntryReason = firstParam(
    (globalParams as Record<string, string | string[] | undefined>)?.from,
  );
  const allowAuthHub =
    authEntryReason === 'signin' || authEntryReason === 'app' || authEntryReason === 'confirm';
  const splashHidden = useRef(false);
  const initialLoadDone = useRef(false);
  const progressChecked = useRef(false);
  const recoveryNavRef = useRef(false);

  /** Reset-password links must open (auth)/password-recovery; expo-router may not default there on cold start. */
  useEffect(() => {
    const maybeOpenRecovery = (url: string) => {
      if (recoveryNavRef.current) return;
      if (!url.includes('access_token')) return;
      if (!url.includes('type=recovery') && !url.includes('password-recovery')) return;
      const p = parseAuthParamsFromUrl(url);
      if (p.access_token && p.refresh_token) {
        recoveryNavRef.current = true;
        router.replace('/(auth)/password-recovery' as any);
      }
    };
    void Linking.getInitialURL().then((u) => {
      if (u) maybeOpenRecovery(u);
    });
    const sub = Linking.addEventListener('url', (e) => {
      maybeOpenRecovery(e.url);
    });
    return () => sub.remove();
  }, [router]);

  const redirectToPaywallOrWelcome = (fallbackToWelcome: boolean) => {
    loadOnboardingProgress().then((saved) => {
      if (saved?.reachedPaywall) {
        router.replace({
          pathname: '/(onboarding)/paywall' as any,
          params: {
            ...(saved.sport ? { sport: saved.sport } : {}),
            ...(saved.competitionDate ? { competitionDate: saved.competitionDate } : {}),
          },
        });
      } else if (fallbackToWelcome) {
        router.replace('/(onboarding)/welcome');
      }
    });
  };

  const hideSplash = () => {
    if (splashHidden.current) return;
    splashHidden.current = true;
    SplashScreen.hideAsync().catch(() => {});
  };

  useEffect(() => {
    const timer = setTimeout(hideSplash, SPLASH_SAFETY_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (loading) return;
    // Avoid mis-routing while the root navigator hasn't reported a segment yet (common after refresh).
    const rootSegment = (segments as string[])[0];
    if (!rootSegment) {
      setTimeout(hideSplash, 50);
      return;
    }
    initialLoadDone.current = true;

    const inAuth = rootSegment === '(auth)';
    const inPasswordRecovery = inAuth && (segments as string[])[1] === 'password-recovery';
    const inOnboarding = rootSegment === '(onboarding)';
    const onPaywall =
      inOnboarding &&
      ((segments as string[]).includes('paywall') || (segments as string[])[1] === 'paywall');
    const onWelcome =
      inOnboarding &&
      ((segments as string[])[1] === 'welcome' || (segments as string[]).includes('welcome'));
    const authSub = (segments as string[])[1];
    const inAuthMainHub =
      inAuth && !inPasswordRecovery && (authSub === undefined || authSub === 'index');

    /**
     * Refresh (or default initial route) can be `(auth)`; send unauthenticated users to welcome unless:
     * `from` param, a synchronous in-app pre-navigation mark, or `canGoBack()` (push from in-app).
     */
    if (allowAuthHub) {
      clearInAppAuthHubEntry();
    }
    if (
      !session &&
      inAuthMainHub &&
      !allowAuthHub &&
      !takeInAppAuthHubEntry() &&
      !router.canGoBack()
    ) {
      router.replace('/(onboarding)/welcome' as any);
    } else if (!session && !inAuth && !inOnboarding) {
      redirectToPaywallOrWelcome(true);
    } else if (!session && onWelcome && !progressChecked.current) {
      // Cold start may land on welcome — check if saved progress lets us skip to paywall.
      progressChecked.current = true;
      redirectToPaywallOrWelcome(false);
    } else if (session && inAuth && !inPasswordRecovery) {
      if (onboardingComplete && hasPremiumAccess) {
        router.replace('/(tabs)');
      } else if (onboardingComplete && !hasPremiumAccess) {
        router.replace('/(onboarding)/paywall');
      }
      // Do not redirect inAuth + !onboardingComplete → welcome: signed-in users may open
      // login from welcome (e.g. dev replay). After sign-in, login.tsx replaces welcome.
    } else if (
      session &&
      !onboardingComplete &&
      !inOnboarding &&
      !inAuth &&
      // After OAuth/email sign-in, `router.replace('/(tabs)')` can run before React
      // applies `onboardingComplete` from `fetchUserState`. This branch would then
      // incorrectly override tabs → welcome. Skip while we're already on main app.
      rootSegment !== '(tabs)'
    ) {
      router.replace('/(onboarding)/welcome');
    } else if (session && onboardingComplete && !hasPremiumAccess && !onPaywall && !inAuth) {
      router.replace('/(onboarding)/paywall');
    } else if (session && onboardingComplete && hasPremiumAccess && inOnboarding) {
      router.replace('/(tabs)');
    } else if (session && !onboardingComplete && hasPremiumAccess && !isOptimisticGrant && onPaywall) {
      // Safety net: paywall only, DB-confirmed subscription only (not optimistic grant).
      // Post-paywall signup handles its own completion in signup.tsx — running this on
      // signup races finishPostPaywallSetup and can hang. When isOptimisticGrant is true
      // the purchase hasn't been synced to the DB yet; PaywallSuperwall routes to
      // signup.tsx which syncs first before completing onboarding.
      completeOnboarding().then(() => router.replace('/(tabs)')).catch(() => {});
    }

    setTimeout(hideSplash, 50);
  }, [session, loading, onboardingComplete, hasPremiumAccess, isOptimisticGrant, segments, allowAuthHub, completeOnboarding]);

  if (!initialLoadDone.current && loading) return null;

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(onboarding)" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="lesson/[id]" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
      <Stack.Screen name="journal/index" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen
        name="category/[id]"
        options={{
          headerShown: true,
          headerBackTitle: 'Library',
          headerStyle: { backgroundColor: '#000' },
          headerTintColor: '#a78bfa',
          headerTitleStyle: {
            fontSize: 17,
            fontWeight: '600',
            color: '#f5f5f5',
          },
          title: '',
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider value={DarkTheme}>
      <PostHogRoot>
        <AuthProvider>
          <PostHogIdentitySync />
          <SuperwallRoot>
            <AnalyticsScreenTracker />
            <RouteGuard />
          </SuperwallRoot>
        </AuthProvider>
      </PostHogRoot>
    </ThemeProvider>
  );
}
