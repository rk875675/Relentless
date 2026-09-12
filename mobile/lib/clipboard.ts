import { requireOptionalNativeModule } from 'expo-modules-core';

/*
 * expo-clipboard was added after the live build shipped, so binaries already
 * on devices do not contain the native module. expo-clipboard's entry point
 * calls requireNativeModule('ExpoClipboard') at import time, which THROWS
 * when the module is missing — so it cannot be imported at the top level of
 * any screen that an older binary might load.
 *
 * Same approach as getStoreReview() in app-store-review-prompt.ts: probe for
 * the native module first, and only then pull in the JS wrapper.
 */
function getClipboard(): typeof import('expo-clipboard') | null {
  if (!requireOptionalNativeModule('ExpoClipboard')) {
    return null;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-clipboard');
}

/** Whether tap-to-copy can work in this binary. */
export function isClipboardAvailable(): boolean {
  return getClipboard() !== null;
}

/**
 * Copies text, reporting whether it worked so the caller can decide what to
 * show. Never throws: a failed copy must not break the screen it is on.
 */
export async function copyText(text: string): Promise<boolean> {
  const clipboard = getClipboard();
  if (!clipboard) return false;
  try {
    await clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}
