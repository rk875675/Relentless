# Google & Apple sign-in (Relentless mobile)

**Single implementation:** `lib/auth-context.tsx` — `signInWithGoogle` (Supabase OAuth + PKCE + `openAuthSessionWithTimeout`) and `signInWithApple` (`signInWithIdToken`). Do not fork duplicate OAuth flows in screens.

**UI entry points:** Use `lib/use-social-sign-in.ts` + `components/auth/AuthSocialSignInButtons.tsx` on every screen that offers social buttons (auth hub, email login, etc.) so navigation stays consistent (`router.replace` with `finishSignInFlow`’s `path`).

## Do not regress (checklist)

1. **Supabase project** — `EXPO_PUBLIC_SUPABASE_URL` must match the project where Google/Apple providers and **Redirect URLs** (`relentless://auth-callback`, etc.) are configured.
2. **Google Cloud** — Web client **Authorized redirect URIs** = only `https://<ref>.supabase.co/auth/v1/callback` for that project (not the app scheme).
3. **`onAuthStateChange`** — Do not `await` heavy Supabase work synchronously inside the listener; it can stall `exchangeCodeForSession` ([supabase-js#1429](https://github.com/supabase/supabase-js/issues/1429)). Profile load is deferred in `AuthProvider`.
4. **OAuth deep link** — Do not add a global `Linking.addEventListener` that re-runs `finishSignInFlow` for the same PKCE code as `signInWithGoogle` (double completion). Cold start uses `getInitialURL` only.
5. **RouteGuard** — Do not send `session && !onboardingComplete` users from `(tabs)` back to welcome during the one frame after sign-in (`_layout.tsx` guards `rootSegment === '(tabs)'`).

## References

- `lib/auth-redirects.ts` — `getOAuthRedirectUrl()`
- `lib/oauth-open-auth-session.ts` — browser session + redirect race
