import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen
        name="signup"
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen
        name="tutorial"
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen
        name="paywall"
        options={{ gestureEnabled: false }}
      />
    </Stack>
  );
}
