/**
 * Route guard may run before in-app `router.push` to `(auth)` updates history / params.
 * Set this synchronously before navigating to the auth hub so the guard does not
 * `replace` back to welcome for one frame.
 */
let inAppToAuthHubPending = false;

export function markInAppAuthHubEntry() {
  inAppToAuthHubPending = true;
}

export function takeInAppAuthHubEntry() {
  if (!inAppToAuthHubPending) return false;
  inAppToAuthHubPending = false;
  return true;
}

/** Call when `from=…` (or other server params) already justifies the auth screen. */
export function clearInAppAuthHubEntry() {
  inAppToAuthHubPending = false;
}
