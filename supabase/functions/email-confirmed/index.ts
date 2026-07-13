/**
 * email-confirmed
 *
 * Friendly landing page shown AFTER Supabase's /auth/v1/verify endpoint has
 * confirmed a new signup. The "Confirm signup" email template points its link
 * at the verify endpoint with redirect_to set to this function, e.g.:
 *
 *   https://<project>.supabase.co/auth/v1/verify
 *     ?token={{ .TokenHash }}&type=signup
 *     &redirect_to=https://<project>.supabase.co/functions/v1/email-confirmed
 *
 * Clicking the email link confirms the account server-side; the user then lands
 * here and is told to open the app and sign in. This works on the current
 * shipped app build (no deep-link handler required) — it just needs this URL
 * added to Supabase Auth → URL configuration → Redirect URLs.
 *
 * Must be deployed with verify_jwt = false (see supabase/config.toml) so the
 * browser redirect can reach it without an Authorization header.
 */

const APP_SCHEME = Deno.env.get("APP_URL_SCHEME") ?? "relentless";

function page(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Email confirmed · Relentless</title>
<style>
  html,body{height:100%;margin:0}
  body{background:#1A1A1B;color:#F2F2F7;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:flex;align-items:center;justify-content:center}
  .box{text-align:center;padding:24px;max-width:440px}
  .logo{font-weight:900;letter-spacing:4px;font-size:28px;margin-bottom:16px}
  .check{font-size:44px;margin-bottom:8px}
  h1{font-size:20px;margin:0 0 10px}
  p{color:#9a9a9a;line-height:1.55;margin:0 0 8px}
  a.btn{display:inline-block;margin-top:20px;background:#fff;color:#000;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:10px}
  .err{display:none}
  .err h1{color:#ff6b6b}
</style>
</head>
<body>
  <div class="box" id="ok">
    <div class="logo">RELENTLESS</div>
    <div class="check">✅</div>
    <h1>Your email is confirmed</h1>
    <p>You're all set. Open the Relentless app and sign in to get started.</p>
    <a class="btn" href="${APP_SCHEME}://">Open Relentless</a>
    <p style="font-size:13px;margin-top:18px">If the button doesn't open the app, open Relentless from your home screen and sign in.</p>
  </div>
  <div class="box err" id="err">
    <div class="logo">RELENTLESS</div>
    <h1>This link didn't work</h1>
    <p id="errmsg">The confirmation link is invalid or has expired.</p>
    <p>Open the Relentless app and request a new confirmation by signing up again.</p>
    <a class="btn" href="${APP_SCHEME}://">Open Relentless</a>
  </div>
  <script>
    // Supabase appends auth errors as a URL #fragment (which the server can't see).
    try {
      var h = window.location.hash ? new URLSearchParams(window.location.hash.slice(1)) : null;
      var q = new URLSearchParams(window.location.search);
      var err = (h && (h.get('error_description') || h.get('error'))) || q.get('error_description') || q.get('error');
      if (err) {
        document.getElementById('ok').style.display = 'none';
        document.getElementById('err').style.display = 'block';
        document.getElementById('errmsg').textContent = decodeURIComponent(err).replace(/\\+/g, ' ');
      }
    } catch (_e) {}
  </script>
</body>
</html>`;
}

Deno.serve(() => {
  return new Response(page(), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
});
