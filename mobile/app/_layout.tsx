import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useGlobalSearchParams, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import { useEffect, useRef, useState } from 'react';
import { Animated, LogBox, View } from 'react-native';
import { AnalyticsScreenTracker } from '@/components/AnalyticsScreenTracker';
import { EntitlementAutoRestore } from '@/components/EntitlementAutoRestore';
import { HeaderBackButton } from '@/components/HeaderBackButton';
import { PostHogIdentitySync } from '@/components/PostHogIdentitySync';
import { PostHogRoot } from '@/components/PostHogRoot';
import { SuperwallRoot } from '@/components/SuperwallRoot';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { parseAuthParamsFromUrl } from '@/lib/auth-redirects';
import { setPendingRecoveryUrl } from '@/lib/recovery-link-store';
import { setPendingConfirmUrl } from '@/lib/confirm-link-store';
import { isAuthLinkAlreadyHandled } from '@/lib/auth-link-dedupe';
import { clearInAppAuthHubEntry, takeInAppAuthHubEntry } from '@/lib/auth-hub-entry';
import { loadOnboardingProgress } from '@/lib/onboarding-local-state';
import { prefetchHomeData } from '@/lib/api-cache';

export { ErrorBoundary } from 'expo-router';

/** Root `app/index.tsx` redirects to welcome; this must be the default child or cold start can still open `(auth)`. */
export const unstable_settings = {
  initialRouteName: 'index',
};

SplashScreen.preventAutoHideAsync();

LogBox.ignoreLogs([/The action 'REPLACE' with payload .* was not handled/]);

const SPLASH_SAFETY_MS = 4000;

function firstParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function RouteGuard() {
  const { session, loading, onboardingComplete, hasPremiumAccess, isOptimisticGrant, profileLoaded, completeOnboarding } = useAuth();
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
  const confirmNavRef = useRef(false);

  /** Reset-password / email-confirmation links must open the right (auth) screen; expo-router may not default there on cold start. */
  useEffect(() => {
    const maybeOpenRecovery = (url: string) => {
      if (recoveryNavRef.current) return;
      // Recovery links land on the password-recovery path (or carry type=recovery).
      // The credential may be PKCE `code`, implicit tokens, or a `token_hash`.
      if (!url.includes('password-recovery') && !url.includes('type=recovery')) return;
      const p = parseAuthParamsFromUrl(url);
      const hasCredential = (p.access_token && p.refresh_token) || p.code || p.token_hash;
      if (hasCredential) {
        // Stash before navigating: on warm start this `url` event fires before the
        // recovery screen mounts, and Linking.getInitialURL() returns null there.
        setPendingRecoveryUrl(url);
        recoveryNavRef.current = true;
        // Note: the recovery screen marks this credential handled once it has
        // resolved it, so a stale relaunch of the same link is ignored.
        router.replace('/(auth)/password-recovery' as any);
      }
    };
    const maybeOpenConfirm = (url: string) => {
      if (confirmNavRef.current) return;
      // Signup confirmation links land on auth-confirm (or carry a confirmation OTP type).
      const isConfirm =
        url.includes('auth-confirm') ||
        /type=(signup|email|email_change|magiclink|invite)/.test(url);
      if (!isConfirm) return;
      const p = parseAuthParamsFromUrl(url);
      const hasCredential = (p.access_token && p.refresh_token) || p.code || p.token_hash;
      if (hasCredential) {
        setPendingConfirmUrl(url);
        // In-memory guard only: prevents this URL from being processed twice
        // within THIS app session (e.g. duplicate `url` events). Persisting the
        // dedupe to AsyncStorage happens in confirm.tsx, and only once
        // verification actually succeeds — see confirm.tsx for why.
        confirmNavRef.current = true;
        router.replace('/(auth)/confirm' as any);
      }
    };
    // getInitialURL() returns the launch URL, which on a reload/relaunch can be
    // a STALE recovery/confirm link. Skip it if we've already handled that exact
    // credential, so signed-in users aren't yanked back to the recovery screen.
    void (async () => {
      const u = await Linking.getInitialURL();
      if (!u) return;
      if (await isAuthLinkAlreadyHandled(u)) return;
      maybeOpenRecovery(u);
      maybeOpenConfirm(u);
    })();
    const sub = Linking.addEventListener('url', (e) => {
      maybeOpenRecovery(e.url);
      maybeOpenConfirm(e.url);
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
    const inConfirm = inAuth && (segments as string[])[1] === 'confirm';
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
        prefetchHomeData();
        router.replace('/(tabs)');
      } else if (onboardingComplete && !hasPremiumAccess) {
        router.replace('/(onboarding)/paywall');
      } else if (inConfirm && profileLoaded) {
        // The confirm screen is a one-shot processing step, unlike login/hub —
        // never leave a just-verified user stranded there even if onboarding
        // isn't complete yet (e.g. email confirmation was required before the
        // paywall/purchase step could run).
        redirectToPaywallOrWelcome(true);
      }
      // Do not redirect inAuth + !onboardingComplete → welcome: signed-in users may open
      // login from welcome (e.g. dev replay). After sign-in, login.tsx replaces welcome.
    } else if (
      session &&
      !onboardingComplete &&
      // Only route to onboarding once the profile has actually loaded. Without
      // this, a signed-in returning user whose fetchUserState is still pending or
      // transiently failing (onboardingComplete defaults to false) gets bounced
      // back to the welcome/get-started screen — making sign-in look broken.
      profileLoaded &&
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
      prefetchHomeData();
      try { router.replace('/(tabs)'); } catch { /* navPhase key change handles this */ }
    } else if (session && !onboardingComplete && hasPremiumAccess && !isOptimisticGrant && onPaywall) {
      // Safety net: paywall only, DB-confirmed subscription only (not optimistic grant).
      // Post-paywall signup handles its own completion in signup.tsx — running this on
      // signup races finishPostPaywallSetup and can hang. When isOptimisticGrant is true
      // the purchase hasn't been synced to the DB yet; PaywallSuperwall routes to
      // signup.tsx which syncs first before completing onboarding.
      completeOnboarding().then(() => { prefetchHomeData(); router.replace('/(tabs)'); }).catch(() => {});
    }

    setTimeout(hideSplash, 50);
  }, [session, loading, onboardingComplete, hasPremiumAccess, isOptimisticGrant, profileLoaded, segments, allowAuthHub, completeOnboarding]);

  // When the user completes signup with a premium subscription, force the
  // navigation tree to remount. router.replace('/(tabs)') is silently
  // swallowed by the nested (onboarding) navigator after OAuth return.
  // Changing the key unmounts the stuck Stack and mounts a fresh one —
  // the same thing a manual reload does.
  const navPhase = session && onboardingComplete && hasPremiumAccess ? 'app' : 'onboarding';
  const prevNavPhase = useRef(navPhase);
  const [transitioning, setTransitioning] = useState(false);

  // Detect phase change synchronously during render so the overlay
  // appears on the SAME frame — not one frame late (which causes a flash).
  // Only needed when transitioning FROM onboarding — (auth) → (tabs) works
  // fine with router.replace and doesn't need the overlay.
  const currentRoot = (segments as string[])[0];
  const fadeAnim = useRef(new Animated.Value(0)).current;
  if (prevNavPhase.current !== navPhase) {
    prevNavPhase.current = navPhase;
    if (!transitioning && currentRoot === '(onboarding)') {
      setTransitioning(true);
      fadeAnim.setValue(1);
    }
  }

  useEffect(() => {
    if (!transitioning) return;
    const t = setTimeout(() => {
      Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setTransitioning(false);
      });
    }, 200);
    return () => clearTimeout(t);
  }, [transitioning, fadeAnim]);

  if (!initialLoadDone.current && loading) {
    return <View style={{ flex: 1, backgroundColor: '#1A1A1B' }} />;
  }

  return (
    <>
    {transitioning && (
      <Animated.View
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#1A1A1B', zIndex: 999, opacity: fadeAnim }}
      />
    )}
    <Stack key={navPhase} screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(onboarding)" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="lesson/[id]" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
      <Stack.Screen name="journal/index" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen
        name="journal/wod-day/[day]"
        options={{
          headerShown: true,
          animation: 'slide_from_right',
          headerBackTitle: 'Lesson',
          headerStyle: { backgroundColor: '#1A1A1B' },
          headerTintColor: '#9B82D4',
          headerTitleStyle: {
            fontSize: 17,
            fontWeight: '600',
            color: '#F2F2F7',
          },
        }}
      />
      <Stack.Screen
        name="journal/session-log"
        options={{
          headerShown: true,
          animation: 'slide_from_right',
          headerBackTitle: 'Lesson',
          headerStyle: { backgroundColor: '#1A1A1B' },
          headerTintColor: '#9B82D4',
          headerTitleStyle: {
            fontSize: 17,
            fontWeight: '600',
            color: '#F2F2F7',
          },
        }}
      />
      <Stack.Screen
        name="programs"
        options={{
          headerShown: true,
          animation: 'slide_from_right',
          headerBackTitle: 'Home',
          headerStyle: { backgroundColor: '#1A1A1B' },
          headerTintColor: '#9B82D4',
          headerTitleStyle: {
            fontSize: 17,
            fontWeight: '600',
            color: '#F2F2F7',
          },
          // Custom back button lives at the navigator level so it renders from
          // frame 1 for every entry point (no native-chevron flash/regression).
          headerLeft: () => <HeaderBackButton label="Home" fallbackHref="/(tabs)" />,
        }}
      />
      <Stack.Screen
        name="category/[id]"
        options={{
          headerShown: true,
          headerBackTitle: 'Library',
          headerStyle: { backgroundColor: '#1A1A1B' },
          headerTintColor: '#9B82D4',
          headerTitleStyle: {
            fontSize: 17,
            fontWeight: '600',
            color: '#F2F2F7',
          },
          title: '',
        }}
      />
      <Stack.Screen
        name="program-wods/[programId]"
        options={{
          headerShown: true,
          animation: 'slide_from_right',
          headerBackTitle: 'Back',
          headerStyle: { backgroundColor: '#1A1A1B' },
          headerTintColor: '#9B82D4',
          headerTitleStyle: {
            fontSize: 17,
            fontWeight: '600',
            color: '#F2F2F7',
          },
          title: '',
        }}
      />
      <Stack.Screen
        name="pack/[id]"
        options={{
          headerShown: true,
          animation: 'slide_from_right',
          headerBackTitle: 'Library',
          headerStyle: { backgroundColor: '#1A1A1B' },
          headerTintColor: '#9B82D4',
          headerTitleStyle: {
            fontSize: 17,
            fontWeight: '600',
            color: '#F2F2F7',
          },
          title: '',
          // Custom back button at navigator level — see programs above.
          headerLeft: () => <HeaderBackButton label="Library" fallbackHref="/(tabs)/library" />,
        }}
      />
    </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider value={DarkTheme}>
      <PostHogRoot>
        <AuthProvider>
          <PostHogIdentitySync />
          <EntitlementAutoRestore />
          <SuperwallRoot>
            <AnalyticsScreenTracker />
            <RouteGuard />
          </SuperwallRoot>
        </AuthProvider>
      </PostHogRoot>
    </ThemeProvider>
  );
}
