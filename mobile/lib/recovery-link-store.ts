/**
 * Holds the password-recovery deep link between the moment a global handler
 * (root layout) first sees it and the moment the password-recovery screen
 * mounts. On a warm start iOS delivers the link via the `url` event, which
 * fires before the screen subscribes — and `Linking.getInitialURL()` returns
 * null in that case — so the screen would otherwise never receive the tokens.
 */
let pendingRecoveryUrl: string | null = null;

export function setPendingRecoveryUrl(url: string): void {
  pendingRecoveryUrl = url;
}

/** Returns the stashed recovery URL without clearing it (idempotent reads). */
export function peekPendingRecoveryUrl(): string | null {
  return pendingRecoveryUrl;
}

export function clearPendingRecoveryUrl(): void {
  pendingRecoveryUrl = null;
}
