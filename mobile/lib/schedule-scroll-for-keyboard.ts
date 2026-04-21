import type { MutableRefObject, RefObject } from 'react';
import { Keyboard } from 'react-native';
import type { ScrollView, View } from 'react-native';

/** Space between the primary button bottom and the top edge of the keyboard. */
const FOOTER_KEYBOARD_GAP = 10;

/**
 * Scroll only as much as needed so the footer (Save / Skip / Finish) sits just
 * above the keyboard — avoids scrollToEnd, which hides the prompt above the fold.
 */
export function scheduleScrollFooterAboveKeyboard(
  scrollRef: RefObject<ScrollView | null>,
  footerRef: RefObject<View | null>,
  scrollYRef: MutableRefObject<number>,
) {
  const run = () => {
    const m = Keyboard.metrics();
    if (!m || m.height <= 0) return;

    const keyboardTop = m.screenY;
    footerRef.current?.measureInWindow((_x, footerTop, _w, footerH) => {
      const footerBottom = footerTop + footerH;
      const targetBottom = keyboardTop - FOOTER_KEYBOARD_GAP;
      const overflow = footerBottom - targetBottom;
      if (overflow <= 1) return;

      const nextY = scrollYRef.current + overflow;
      scrollRef.current?.scrollTo({ y: Math.max(0, nextY), animated: true });
    });
  };

  // Keyboard + layout often settle after the first frame; second pass avoids a no-op measure.
  requestAnimationFrame(() => {
    setTimeout(run, 200);
    setTimeout(run, 480);
  });
}
