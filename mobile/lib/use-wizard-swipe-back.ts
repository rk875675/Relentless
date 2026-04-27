import { useRef } from 'react';
import { PanResponder } from 'react-native';

/** Finger starts within this many px of the left screen edge → iOS-style back swipe. */
const EDGE_START_PX = 56;
const SWIPE_EDGE_RELEASE = 26;
const SWIPE_MAIN_RELEASE = 52;
const HORIZONTAL_MIN = 14;

export type WizardSwipeBackOptions = {
  /**
   * When true, only a swipe that **begins** on the left edge can go back. Use on
   * screens with a horizontal scroll (e.g. testimonial carousel) so swiping
   * between cards is not confused with a “pop screen” right-swipe.
   */
  swipeFromEdgeOnly?: boolean;
};

/**
 * Swipe right to go back one wizard step when the native stack gesture is off.
 * Uses capture so horizontal drags win over scroll views; also recognizes
 * drags that begin near the left edge (short pull is enough).
 */
export function useWizardSwipeBackRight(
  shouldHandle: () => boolean,
  onSwipeBack: () => void,
  options?: WizardSwipeBackOptions,
) {
  const shouldRef = useRef(shouldHandle);
  shouldRef.current = shouldHandle;
  const onSwipeRef = useRef(onSwipeBack);
  onSwipeRef.current = onSwipeBack;
  const edgeOnlyRef = useRef(options?.swipeFromEdgeOnly === true);
  edgeOnlyRef.current = options?.swipeFromEdgeOnly === true;
  const startXRef = useRef(0);

  return useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onPanResponderGrant: (e) => {
        startXRef.current = e.nativeEvent.pageX;
      },
      onMoveShouldSetPanResponderCapture: (_, gs) => {
        if (!shouldRef.current()) return false;
        const fromEdge = startXRef.current < EDGE_START_PX;
        if (edgeOnlyRef.current && !fromEdge) return false;
        if (fromEdge) return gs.dx > 3;
        return gs.dx > HORIZONTAL_MIN && gs.dx > Math.abs(gs.dy) * 1.22;
      },
      onMoveShouldSetPanResponder: (_, gs) => {
        if (!shouldRef.current()) return false;
        const fromEdge = startXRef.current < EDGE_START_PX;
        if (edgeOnlyRef.current && !fromEdge) return false;
        if (fromEdge) return gs.dx > 3;
        return gs.dx > HORIZONTAL_MIN && gs.dx > Math.abs(gs.dy) * 1.22;
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, gs) => {
        if (!shouldRef.current()) return;
        const fromEdge = startXRef.current < EDGE_START_PX;
        if (edgeOnlyRef.current && !fromEdge) return;
        const ok = fromEdge ? gs.dx > SWIPE_EDGE_RELEASE : gs.dx > SWIPE_MAIN_RELEASE;
        if (ok) onSwipeRef.current();
      },
    }),
  ).current.panHandlers;
}
