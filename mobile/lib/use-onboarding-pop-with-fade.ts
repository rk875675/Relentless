import { useRef, useCallback, useEffect } from 'react';
import { Animated, Dimensions, Easing } from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import type { NavigationAction } from '@react-navigation/native';
import {
  useWizardSwipeBackRight,
  type WizardSwipeBackOptions,
} from '@/lib/use-wizard-swipe-back';

const SLIDE_OUT_MS = 320;

function screenWidth() {
  return Dimensions.get('window').width;
}

/**
 * Slides the screen off to the right, then pops — for onboarding stack screens
 * where the native swipe gesture is disabled. Matches the “drag page away” feel.
 * `beforeRemove` dispatches the same action after the animation so navigation
 * does not get stuck after `preventDefault`.
 */
export function useOnboardingPopWithFade(swipeOptions?: WizardSwipeBackOptions) {
  const router = useRouter();
  const navigation = useNavigation();
  const shellTranslateX = useRef(new Animated.Value(0)).current;
  const busyRef = useRef(false);
  /** Lets the next `beforeRemove` through (after our slide + programmatic pop). */
  const bypassNextBeforeRemoveRef = useRef(false);

  const slideOffThen = useCallback(
    (after: () => void) => {
      if (!navigation.canGoBack() || busyRef.current) return;
      busyRef.current = true;
      shellTranslateX.setValue(0);
      Animated.timing(shellTranslateX, {
        toValue: screenWidth(),
        duration: SLIDE_OUT_MS,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }).start(({ finished }) => {
        busyRef.current = false;
        if (!finished) return;
        bypassNextBeforeRemoveRef.current = true;
        after();
      });
    },
    [navigation, shellTranslateX],
  );

  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (bypassNextBeforeRemoveRef.current) {
        bypassNextBeforeRemoveRef.current = false;
        return;
      }
      if (!navigation.canGoBack()) return;
      e.preventDefault();
      const action = e.data.action as NavigationAction;
      slideOffThen(() => {
        navigation.dispatch(action);
      });
    });
  }, [navigation, slideOffThen]);

  const panHandlers = useWizardSwipeBackRight(
    () => navigation.canGoBack(),
    () => {
      slideOffThen(() => {
        router.back();
      });
    },
    swipeOptions,
  );

  const onPop = useCallback(() => {
    slideOffThen(() => {
      router.back();
    });
  }, [slideOffThen, router]);

  return { shellTranslateX, panHandlers, onPop };
}
