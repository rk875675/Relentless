import { useRef, useCallback } from 'react';
import { Animated, PanResponder } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { WizardSwipeBackOptions } from '@/lib/use-wizard-swipe-back';

/**
 * Thin wrapper now that the native stack uses a slide animation + gestures.
 * `shellTranslateX` stays 0 so existing Animated.View wrappers are inert,
 * `panHandlers` is a no-op PanResponder, and `onPop` pops the native stack.
 *
 * onPop uses the native stack's goBack (the same path as the swipe-back
 * gesture) rather than router.back(). welcome's resume effect pushes the saved
 * screen on mount, which desyncs the router history from the native stack;
 * router.back() then remounts welcome and bounces the user forward to the saved
 * screen. navigation.goBack() pops to the existing instance like the gesture.
 */
export function useOnboardingPopWithFade(_swipeOptions?: WizardSwipeBackOptions) {
  const navigation = useNavigation();
  const shellTranslateX = useRef(new Animated.Value(0)).current;
  const panHandlers = useRef(PanResponder.create({})).current.panHandlers;

  const onPop = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [navigation]);

  return { shellTranslateX, panHandlers, onPop };
}
