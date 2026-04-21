import { Stack } from 'expo-router';

export default function OnboardingLayout() {
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
