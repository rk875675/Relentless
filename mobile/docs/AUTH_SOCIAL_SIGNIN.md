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
