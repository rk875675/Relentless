import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { SuperwallRoot } from '@/components/SuperwallRoot';
import { AuthProvider, useAuth } from '@/lib/auth-context';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

const SPLASH_SAFETY_MS = 4000;

function RouteGuard() {
  const { session, loading, onboardingComplete, hasPremiumAccess, completeOnboarding } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const splashHidden = useRef(false);
  const initialLoadDone = useRef(false);

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
    const inOnboarding = rootSegment === '(onboarding)';
    const onPaywall = inOnboarding && segments[1] === 'paywall';

    if (!session && !inAuth && !inOnboarding) {
      router.replace('/(onboarding)/welcome');
    } else if (session && inAuth) {
      if (onboardingComplete && hasPremiumAccess) {
        router.replace('/(tabs)');
      } else if (onboardingComplete && !hasPremiumAccess) {
        router.replace('/(onboarding)/paywall');
      }
      // Do not redirect inAuth + !onboardingComplete → welcome: signed-in users may open
      // login from welcome (e.g. dev replay). After sign-in, login.tsx replaces welcome.
    } else if (session && !onboardingComplete && !inOnboarding && !inAuth) {
      router.replace('/(onboarding)/welcome');
    } else if (session && onboardingComplete && !hasPremiumAccess && !onPaywall && !inAuth) {
      router.replace('/(onboarding)/paywall');
    } else if (session && onboardingComplete && hasPremiumAccess && inOnboarding) {
      router.replace('/(tabs)');
    } else if (session && !onboardingComplete && hasPremiumAccess && onPaywall) {
      // User purchased but completeOnboarding() hasn't fired yet (e.g. still
      // awaiting the DB refresh in PaywallSuperwall's useEffect). Complete it
      // here and navigate — this is a safety net for the async gap (paywall only).
      completeOnboarding().then(() => router.replace('/(tabs)')).catch(() => {});
    }

    setTimeout(hideSplash, 50);
  }, [session, loading, onboardingComplete, hasPremiumAccess, segments, completeOnboarding]);

  if (!initialLoadDone.current && loading) return null;

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(onboarding)" />
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
      <AuthProvider>
        <SuperwallRoot>
          <RouteGuard />
        </SuperwallRoot>
      </AuthProvider>
    </ThemeProvider>
  );
}
