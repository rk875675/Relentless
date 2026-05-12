# Google & Apple sign-in (Relentless mobile)

**Single implementation:** `lib/auth-context.tsx` — `signInWithGoogle` (Supabase OAuth + PKCE + `openAuthSessionWithTimeout`) and `signInWithApple` (`signInWithIdToken`). Do not fork duplicate OAuth flows in screens.

**UI entry points:** Use `lib/use-social-sign-in.ts` + `components/auth/AuthSocialSignInButtons.tsx` on every screen that offers social buttons (auth hub, email login, etc.) so navigation stays consistent (`router.replace` with `finishSignInFlow`’s `path`).

## Post-paywall Apple signup fix

Apple is different from the normal Google path after the paywall:

1. The user buys in Superwall/StoreKit while unauthenticated.
2. Superwall emits a trusted purchase event before the Supabase Apple account exists.
3. The user then taps **Continue with Apple** on `app/(onboarding)/signup.tsx`.
4. Only after `signInWithApple()` succeeds can the app call `/purchases/restore` with the new Supabase access token.

The stable handoff is:

- `components/SuperwallInner.tsx` extracts the original transaction id from the Superwall `transactionComplete` / `transactionRestore` event and stores it with `emitTrustedPaywallPurchase({ originalTransactionId })`.
- `lib/trusted-paywall-purchase.ts` keeps the last trusted transaction in memory so signup can read it after Apple auth finishes.
- `app/(onboarding)/signup.tsx` first tries `syncSubscriptionWithBackend(originalTransactionId)` using that stored transaction id. If it cannot, it falls back to `restorePurchasesViaStoreKit()`.
- Backend verification is required before signup completes onboarding or routes into tabs. If `/purchases/restore` fails, show the setup retry state instead of letting the user into a broken app that will hit `Active subscription required`.
- After verified sync/restore, signup calls `refreshUserState()` and `bustCache()` before finishing onboarding so protected endpoints do not keep stale `Active subscription required` errors.

Do **not** rely only on the client-side `hasPremiumAccess` / optimistic grant here. That can show `premium: true` locally while backend functions still deny `/lessons`, `/progress`, `/streak`, and `/journal` because `public.entitlements.status` is still `none`.

The setup screen also has a component-level watchdog:

- `syncing` starts when post-paywall signup begins.
- If setup stalls before backend entitlement verification, show a retryable setup error instead of navigating.
- If setup stalls after backend entitlement verification, `setupComplete` is set after `POST_PAYWALL_TOTAL_TIMEOUT_MS`.
- `finishSetupNavigation()` immediately calls `router.replace('/(tabs)')`, and a `setupComplete` effect keeps retrying a few times.

Keep this state-driven escape hatch. Direct one-shot navigation inside the async setup chain can be swallowed by the nested onboarding navigator and leave the user stuck on **Setting up your account...**.

## Three problems that caused post-paywall OAuth to hang (and their fixes)

These three issues interacted to make Google/Apple sign-up after purchase appear stuck. Each has a distinct root cause:

### 1. `router.replace('/(tabs)')` silently swallowed by nested onboarding Stack

**Symptom:** `router.replace` is called (confirmed via logs), segments stay `["(onboarding)", "signup"]`, user stuck on spinner.

**Root cause:** expo-router's `router.replace` from within a nested `(onboarding)` Stack cannot navigate to a sibling `(tabs)` group. The navigation action is silently dropped. This affects ALL navigation methods (`router.replace`, `router.push`, `CommonActions.reset`) when called from within the nested Stack.

**Fix:** `_layout.tsx` uses a `key={navPhase}` prop on the root `<Stack>`. When `session && onboardingComplete && hasPremiumAccess` becomes true, `navPhase` changes from `'onboarding'` to `'app'`, forcing React to unmount the stuck Stack and mount a fresh one. This is the same thing a manual reload does. A synchronous transition detection renders a black `<View>` for 150ms to prevent UI flash during the remount.

**Do not:** Remove the `key={navPhase}` prop, attempt to fix this with `router.replace` alone, or add `setTimeout` wrappers — none of those work.

### 2. `isPostPaywall` URL param lost after OAuth backgrounding / Stack remount

**Symptom:** After Google OAuth browser return, `handleSocial` falls through to the "pre-paywall" branch instead of triggering `finishPostPaywallSetup`. User sees the sign-up hub instead of the spinner.

**Root cause:** Two causes: (a) expo-router can lose URL search params when the app returns from background after OAuth; (b) if `navPhase` changes during OAuth, the Stack remounts and the signup component remounts with fresh state — `useRef` values are lost.

**Fix:** `isPostPaywall` uses `getLastTrustedPaywallPurchase()` as a remount-safe fallback. This is a module-level variable in `trusted-paywall-purchase.ts` that survives Stack remounts, component remounts, and app backgrounding. `syncing` state also initializes to `true` when `isPostPaywall && session` so the spinner shows immediately on remount.

**Do not:** Use `useRef` or `useState` alone to latch `isPostPaywall` — refs and state reset on component remount. Do not rely on URL params surviving OAuth round-trips.

### 3. Apple sandbox API returns 404 for JWS verification

**Symptom:** `POST /purchases/restore` returns 422 "Purchase could not be verified with Apple." Entitlement stays `'none'`.

**Root cause:** Apple's App Store Server API is unreliable in sandbox — it returns 404 for transactions that haven't been indexed yet. The edge function tried production → sandbox → transaction lookup, all failed.

**Fix:** Client sends the Apple-signed JWS (`purchaseToken` from expo-iap's `PurchaseIOS`) as `signedTransactionInfo` in the request body. The edge function's `resolveEntitlementFromSignedTransaction` decodes the JWS payload directly (bundleId check enforced) without calling Apple's REST API. Also raised the Zod schema max from 4096 to 16384 for Apple's JWS tokens. The `fetchJwsForTransaction` helper in `iap-restore.ts` fetches the JWS from StoreKit before the first sync attempt.

**Do not:** Remove the `signedTransactionInfo` field from the Zod schema, reduce the max below 16384, or remove `purchaseToken` from `IosPurchaseLike`.

## Do not regress (checklist)

1. **Supabase project** — `EXPO_PUBLIC_SUPABASE_URL` must match the project where Google/Apple providers and **Redirect URLs** (`relentless://auth-callback`, etc.) are configured.
2. **Google Cloud** — Web client **Authorized redirect URIs** = only `https://<ref>.supabase.co/auth/v1/callback` for that project (not the app scheme).
3. **`onAuthStateChange`** — Do not `await` heavy Supabase work synchronously inside the listener; it can stall `exchangeCodeForSession` ([supabase-js#1429](https://github.com/supabase/supabase-js/issues/1429)). Profile load is deferred in `AuthProvider`.
4. **OAuth deep link** — Do not add a global `Linking.addEventListener` that re-runs `finishSignInFlow` for the same PKCE code as `signInWithGoogle` (double completion). Cold start uses `getInitialURL` only.
5. **RouteGuard** — Do not send `session && !onboardingComplete` users from `(tabs)` back to welcome during the one frame after sign-in (`_layout.tsx` guards `rootSegment === '(tabs)'`).
6. **Post-paywall Apple signup** — Do not remove the trusted purchase handoff, the StoreKit restore fallback, `bustCache()`, or the `setupComplete` watchdog/retry effect.

## References

- `lib/auth-redirects.ts` — `getOAuthRedirectUrl()`
- `lib/oauth-open-auth-session.ts` — browser session + redirect race
- `lib/trusted-paywall-purchase.ts` — post-paywall purchase handoff
- `lib/iap-restore.ts` — StoreKit restore fallback
- `lib/purchases-sync.ts` — `/purchases/restore` client
