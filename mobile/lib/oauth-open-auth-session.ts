import * as WebBrowser from 'expo-web-browser';
import { WebBrowserResultType, type WebBrowserAuthSessionResult } from 'expo-web-browser';
import * as Linking from 'expo-linking';

const DEFAULT_TIMEOUT_MS = 3 * 60 * 1000;

/**
 * `openAuthSessionAsync` can leave the app stuck on a loading state if the auth session
 * never resolves. Time out, dismiss the browser, and return a result the caller can treat as cancelled.
 */
export async function openAuthSessionWithTimeout(
  url: string,
  redirect: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<WebBrowserAuthSessionResult> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let removeLinkListener: (() => void) | undefined;
  const redirectPromise = new Promise<WebBrowserAuthSessionResult>((resolve) => {
    const sub = Linking.addEventListener('url', (event) => {
      if (!event.url.startsWith(redirect)) return;
      resolve({ type: 'success', url: event.url });
    });
    removeLinkListener = () => sub.remove();
  });
  const sessionPromise = WebBrowser.openAuthSessionAsync(url, redirect, { preferEphemeralSession: true });
  const timeoutPromise = new Promise<'timeout'>((resolve) => {
    timeoutId = setTimeout(() => resolve('timeout'), timeoutMs);
  });
  const race = await Promise.race([
    sessionPromise.then((r) => ({ tag: 'ok' as const, r })),
    redirectPromise.then((r) => ({ tag: 'redirect' as const, r })),
    timeoutPromise.then(() => ({ tag: 't' as const })),
  ]);
  removeLinkListener?.();
  if (race.tag === 't') {
    try {
      await WebBrowser.dismissBrowser();
    } catch {
      /* noop */
    }
    return { type: WebBrowserResultType.DISMISS };
  }
  if (race.tag === 'redirect') {
    try {
      await WebBrowser.dismissBrowser();
    } catch {
      /* noop */
    }
  }
  if (timeoutId) clearTimeout(timeoutId);
  return race.r;
}
