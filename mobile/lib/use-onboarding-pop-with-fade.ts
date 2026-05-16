import { useRef, useCallback } from 'react';
import { Animated, PanResponder } from 'react-native';
import { useRouter } from 'expo-router';
import type { WizardSwipeBackOptions } from '@/lib/use-wizard-swipe-back';

/**
 * Thin wrapper now that the native stack uses a slide animation + gestures.
 * `shellTranslateX` stays 0 so existing Animated.View wrappers are inert,
 * `panHandlers` is a no-op PanResponder, and `onPop` calls `router.back()`.
 */
export function useOnboardingPopWithFade(_swipeOptions?: WizardSwipeBackOptions) {
  const router = useRouter();
  const shellTranslateX = useRef(new Animated.Value(0)).current;
  const panHandlers = useRef(PanResponder.create({})).current.panHandlers;

  const onPop = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    }
  }, [router]);

  return { shellTranslateX, panHandlers, onPop };
}
