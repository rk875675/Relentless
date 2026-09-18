import { CommonActions } from '@react-navigation/native';

type StackRoute = { name: string; params?: Record<string, string> };

/**
 * Rebuilds the (onboarding) stack as the main linear funnel ending on sport-selection,
 * so the user stays one step from the paywall but can pop back through earlier screens.
 */
export function resetOnboardingStackNearPaywall(
  navigation: { dispatch: (action: ReturnType<typeof CommonActions.reset>) => void },
  params: { sport?: string },
): void {
  const sportTrim = params.sport?.trim();
  const sportParams = sportTrim ? { sport: sportTrim } : undefined;

  const routes: StackRoute[] = [
    { name: 'welcome' },
    { name: 'onboarding-intake' },
    { name: 'unlocked-potential' },
    { name: 'mac-teaser' },
    { name: 'mac-question' },
    { name: 'we-can-train' },
    { name: 'lesson-structure' },
    { name: 'grant-intro' },
    { name: 'onboarding-trophy' },
    { name: 'tutorial' },
    { name: 'sport-selection', ...(sportParams ? { params: sportParams } : {}) },
  ];

  navigation.dispatch(
    CommonActions.reset({
      index: routes.length - 1,
      routes: routes.map((r) => ({
        name: r.name,
        params: r.params ?? {},
      })),
    }),
  );
}
