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

/**
 * Circuit breaker: a navigation redirect loop (observed bouncing two routes at
 * ~8 changes/sec) can flood PostHog with screen/onboarding events. Humans don't
 * navigate this fast, so when route changes exceed the window cap we stop
 * capturing until navigation calms down. Refs still update so state stays fresh.
 */
const ROUTE_BURST_WINDOW_MS = 10_000;
const ROUTE_BURST_MAX = 12;
let recentRouteChangeTimes: number[] = [];

function routeChangeAllowed(now: number): boolean {
  recentRouteChangeTimes = recentRouteChangeTimes.filter((t) => now - t < ROUTE_BURST_WINDOW_MS);
  recentRouteChangeTimes.push(now);
  return recentRouteChangeTimes.length <= ROUTE_BURST_MAX;
}

/**
 * Collapse dynamic segments so `$screen_name` stays low-cardinality
 * (`/lesson/abc123` → `/lesson/[id]`). The raw path is still sent as `route`.
 */
const DYNAMIC_ROUTE_PATTERNS: Array<[RegExp, string]> = [
  [/^\/lesson\/[^/]+$/, '/lesson/[id]'],
  [/^\/pack\/[^/]+$/, '/pack/[id]'],
  [/^\/coach\/[^/]+$/, '/coach/[key]'],
  [/^\/category\/[^/]+$/, '/category/[id]'],
  [/^\/journal\/wod-day\/[^/]+$/, '/journal/wod-day/[day]'],
  [/^\/journal\/[^/]+$/, '/journal/[id]'],
  [/^\/program-wods\/[^/]+$/, '/program-wods/[programId]'],
];

function normalizeScreenName(pathname: string): string {
  for (const [pattern, replacement] of DYNAMIC_ROUTE_PATTERNS) {
    if (pattern.test(pathname)) return replacement;
  }
  return pathname;
}

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
    lastTrackedRouteRef.current = pathname;

    // Redirect-loop guard: keep refs current but skip captures during a burst.
    if (!routeChangeAllowed(Date.now())) {
      const onboardingStepInBurst = getOnboardingStepForRoute(pathname);
      activeOnboardingRouteRef.current = onboardingStepInBurst
        ? { pathname, enteredAt: Date.now() }
        : null;
      if (__DEV__) {
        console.warn('[Analytics] route burst — skipping capture for', pathname);
      }
      return;
    }

    trackActiveOnboardingExit(pathname, 'route_change');

    if (__DEV__) {
      console.log('[Analytics] screen', pathname);
    }

    analytics.screen(normalizeScreenName(pathname), {
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
