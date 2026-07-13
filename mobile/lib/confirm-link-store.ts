/**
 * Holds the signup email-confirmation deep link between the moment the root
 * layout's global handler first sees it and the moment the (auth)/confirm
 * screen mounts. On a warm start iOS delivers the link via the `url` event,
 * which fires before the screen subscribes — and `Linking.getInitialURL()`
 * returns null in that case — so the screen would otherwise never receive the
 * token. Mirrors recovery-link-store.ts.
 */
let pendingConfirmUrl: string | null = null;

export function setPendingConfirmUrl(url: string): void {
  pendingConfirmUrl = url;
}

/** Returns the stashed confirmation URL without clearing it (idempotent reads). */
export function peekPendingConfirmUrl(): string | null {
  return pendingConfirmUrl;
}

export function clearPendingConfirmUrl(): void {
  pendingConfirmUrl = null;
}
