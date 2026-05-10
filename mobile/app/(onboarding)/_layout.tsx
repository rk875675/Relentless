import { Stack, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { saveOnboardingScreen } from '@/lib/onboarding-local-state';

/** First matched group sub-route is not `welcome` by default; set explicit entry for cold start. */
export const unstable_settings = {
  initialRouteName: 'welcome',
};

export default function OnboardingLayout() {
  const segments = useSegments();

  useEffect(() => {
    if (segments[0] !== '(onboarding)' || !segments[1]) return;
    const screenName = segments[1];
    if (screenName !== 'welcome') {
      saveOnboardingScreen(screenName);
    }
  }, [segments]);

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade', gestureEnabled: false }}>
      <Stack.Screen name="signup" options={{ gestureEnabled: false }} />
      <Stack.Screen name="tutorial" options={{ gestureEnabled: false }} />
      <Stack.Screen name="paywall" options={{ gestureEnabled: false }} />
      <Stack.Screen name="onboarding-intake" options={{ gestureEnabled: false }} />
      <Stack.Screen name="exercise-a" options={{ gestureEnabled: false }} />
      <Stack.Screen name="exercise-c" options={{ gestureEnabled: false }} />
      <Stack.Screen name="exercise-m" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
