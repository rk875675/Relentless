/**
 * auth-redirect
 *
 * Bridges Supabase auth emails to the mobile app's custom URL scheme.
 *
 * Email clients (notably Gmail) strip raw `relentless://` links, so the
 * Reset Password template links here over HTTPS instead:
 *
 *   https://<project>.supabase.co/functions/v1/auth-redirect?token_hash={{ .TokenHash }}&type=recovery
 *
 * This endpoint forwards the auth params to the app deep link
 * `relentless://password-recovery?...`. The credential rides in the query
 * string (which survives the iOS custom-scheme handoff; URL #fragments do not),
 * and `token_hash` is only consumed when the app calls verifyOtp — so email
 * link prefetchers can't invalidate it.
 *
 * Must be deployed with verify_jwt = false (see supabase/config.toml).
 */

const APP_SCHEME = Deno.env.get("APP_URL_SCHEME") ?? "relentless";
const RECOVERY_PATH = "password-recovery";

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

function buildDeepLink(search: URLSearchParams): string {
  const out = new URLSearchParams();
  for (const key of FORWARD_PARAMS) {
    const value = search.get(key);
    if (value) out.set(key, value);
  }
  if (!out.get("type")) out.set("type", "recovery");
  return `${APP_SCHEME}://${RECOVERY_PATH}?${out.toString()}`;
}

function page(deepLink: string): string {
  const safe = deepLink.replace(/"/g, "&quot;");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Opening Relentless…</title>
<style>
  html,body{height:100%;margin:0}
  body{background:#000;color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:flex;align-items:center;justify-content:center}
  .box{text-align:center;padding:24px;max-width:420px}
  .logo{font-weight:900;letter-spacing:4px;font-size:28px;margin-bottom:8px}
  p{color:#b3b3b3;line-height:1.5}
  a.btn{display:inline-block;margin-top:18px;background:#fff;color:#000;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px}
</style>
</head>
<body>
  <div class="box">
    <div class="logo">RELENTLESS</div>
    <p>Opening the app to reset your password…</p>
    <a class="btn" href="${safe}">Open Relentless</a>
    <p style="font-size:13px;margin-top:18px">If nothing happens, tap the button above. This must be opened on the device with the Relentless app installed.</p>
  </div>
  <script>
    // User-initiated navigation: trigger the custom-scheme open immediately.
    window.location.replace("${safe}");
  </script>
</body>
</html>`;
}

Deno.serve((req) => {
  const url = new URL(req.url);
  const deepLink = buildDeepLink(url.searchParams);
  return new Response(page(deepLink), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
});
