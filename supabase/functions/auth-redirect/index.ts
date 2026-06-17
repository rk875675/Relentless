/**
 * auth-redirect
 *
 * Bridges Supabase auth emails to the mobile app's custom URL scheme.
 *
 * Email clients (notably Gmail) strip raw `relentless://` links, so auth email
 * templates link here over HTTPS instead:
 *
 *   Reset password:   .../auth-redirect?token_hash={{ .TokenHash }}&type=recovery
 *   Confirm signup:   .../auth-redirect?token_hash={{ .TokenHash }}&type=signup
 *
 * This endpoint forwards the auth params to the matching app deep link:
 *   type=recovery                  → relentless://password-recovery?...
 *   type=signup|email|magiclink|invite → relentless://auth-confirm?...
 *
 * It responds with an HTTP 302 redirect to that deep link. We must NOT serve an
 * HTML "Open the app" page here: Supabase Edge Functions on the default
 * *.supabase.co/functions/v1 domain rewrite any GET response of type text/html
 * to text/plain (anti-phishing), so a real page renders as raw source in the
 * browser. A 302 has no HTML body, so it is not rewritten — the browser simply
 * follows the Location header and iOS opens the app.
 * See: https://supabase.com/docs/guides/functions/limits
 *
 * The credential rides in the query string (which survives the iOS
 * custom-scheme handoff; URL #fragments do not), and `token_hash` is only
 * consumed when the app calls verifyOtp — so email link prefetchers that follow
 * this redirect can't invalidate it (this function never calls verify).
 *
 * Must be deployed with verify_jwt = false (see supabase/config.toml).
 */

const APP_SCHEME = Deno.env.get("APP_URL_SCHEME") ?? "relentless";
const RECOVERY_PATH = "password-recovery";
const CONFIRM_PATH = "auth-confirm";

const FORWARD_PARAMS = [
  "token_hash",
  "type",
  "code",
  "access_token",
  "refresh_token",
  "expires_in",
  "expires_at",
  "token_type",
  "error",
  "error_code",
  "error_description",
];

/** Signup/confirmation OTP types route to the app's confirm screen, not recovery. */
const CONFIRM_TYPES = new Set(["signup", "email", "email_change", "magiclink", "invite"]);

function buildDeepLink(search: URLSearchParams): string {
  const out = new URLSearchParams();
  for (const key of FORWARD_PARAMS) {
    const value = search.get(key);
    if (value) out.set(key, value);
  }
  const type = out.get("type");
  const path = type && CONFIRM_TYPES.has(type) ? CONFIRM_PATH : RECOVERY_PATH;
  if (!type) out.set("type", "recovery");
  return `${APP_SCHEME}://${path}?${out.toString()}`;
}

Deno.serve((req) => {
  const url = new URL(req.url);
  const deepLink = buildDeepLink(url.searchParams);
  // 302 to the app's custom scheme. No HTML body (which the platform would
  // rewrite to text/plain and show as raw source). The browser follows the
  // Location header and iOS opens the Relentless app at the right screen.
  return new Response(null, {
    status: 302,
    headers: {
      location: deepLink,
      "cache-control": "no-store",
    },
  });
});
