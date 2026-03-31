import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { SuperwallRoot } from '@/components/SuperwallRoot';
import { AuthProvider, useAuth } from '@/lib/auth-context';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

function RouteGuard() {
  const { session, loading, onboardingComplete, hasPremiumAccess } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuth = segments[0] === '(auth)';
    const inOnboarding = segments[0] === '(onboarding)';
    const onPaywall = inOnboarding && segments[1] === 'paywall';

    if (!session && !inAuth) {
      router.replace('/(auth)/login');
    } else if (session && inAuth) {
      if (onboardingComplete && hasPremiumAccess) {
        router.replace('/(tabs)');
      } else if (onboardingComplete && !hasPremiumAccess) {
        router.replace('/(onboarding)/paywall');
      } else {
        router.replace('/(onboarding)/credibility');
      }
    } else if (session && !onboardingComplete && !inOnboarding) {
      router.replace('/(onboarding)/credibility');
    } else if (session && onboardingComplete && !hasPremiumAccess && !onPaywall && !inAuth) {
      router.replace('/(onboarding)/paywall');
    } else if (session && onboardingComplete && hasPremiumAccess && inOnboarding) {
      router.replace('/(tabs)');
    }
  }, [session, loading, onboardingComplete, hasPremiumAccess, segments]);

  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync();
    }
  }, [loading]);

  if (loading) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(onboarding)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="lesson/[id]" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
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
      <SuperwallRoot>
        <AuthProvider>
          <RouteGuard />
        </AuthProvider>
      </SuperwallRoot>
    </ThemeProvider>
  );
}
