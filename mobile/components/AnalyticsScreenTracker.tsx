import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { analytics } from '@/lib/analytics';
import { useAuth } from '@/lib/auth-context';
import {
  getOnboardingStepForRoute,
  trackOnboardingScreenExited,
  trackOnboardingScreenViewed,
} from '@/lib/onboarding-analytics';

type ActiveOnboardingRoute = {
  pathname: string;
  enteredAt: number;
};

/** Tracks route pathname changes only; no params or user-entered text are sent. */
export function AnalyticsScreenTracker() {
  const pathname = usePathname();
  const { session, loading, onboardingComplete, entitlementStatus, hasPremiumAccess } = useAuth();
  const lastTrackedRouteRef = useRef<string | null>(null);
  const activeOnboardingRouteRef = useRef<ActiveOnboardingRoute | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const trackActiveOnboardingExit = (
    nextRoute: string | null,
    exitType: 'route_change' | 'background',
  ) => {
    const activeRoute = activeOnboardingRouteRef.current;
    if (!activeRoute) return;

    const onboardingStep = getOnboardingStepForRoute(activeRoute.pathname);
    if (!onboardingStep) return;

    trackOnboardingScreenExited({
      ...onboardingStep,
      source_route: activeRoute.pathname,
      next_route: nextRoute,
      exit_type: exitType,
      time_on_step_ms: Date.now() - activeRoute.enteredAt,
    });

    if (exitType === 'background') {
      activeOnboardingRouteRef.current = null;
    }
  };

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;

      if (prevState === 'active' && nextState !== 'active') {
        trackActiveOnboardingExit(null, 'background');
      } else if (prevState !== 'active' && nextState === 'active' && pathname) {
        const onboardingStep = getOnboardingStepForRoute(pathname);
        activeOnboardingRouteRef.current = onboardingStep ? { pathname, enteredAt: Date.now() } : null;
      }
    });

    return () => sub.remove();
  }, [pathname]);

  useEffect(() => {
    if (loading || !pathname || lastTrackedRouteRef.current === pathname) return;

    const previousRoute = lastTrackedRouteRef.current;
    trackActiveOnboardingExit(pathname, 'route_change');
    lastTrackedRouteRef.current = pathname;

    if (__DEV__) {
      console.log('[Analytics] screen', pathname);
    }

    analytics.screen(pathname, {
      route: pathname,
      previous_route: previousRoute,
      authenticated: Boolean(session),
      onboarding_completed: onboardingComplete,
      premium: hasPremiumAccess,
      entitlement_status: entitlementStatus ?? 'none',
    });

    const onboardingStep = getOnboardingStepForRoute(pathname);
    if (onboardingStep) {
      activeOnboardingRouteRef.current = { pathname, enteredAt: Date.now() };
      trackOnboardingScreenViewed({
        ...onboardingStep,
        source_route: pathname,
        previous_route: previousRoute,
      });
    } else {
      activeOnboardingRouteRef.current = null;
    }
  }, [entitlementStatus, hasPremiumAccess, loading, onboardingComplete, pathname, session]);

  return null;
}
