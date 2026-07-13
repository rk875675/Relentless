/**
 * Auth admin helper (no secrets hardcoded).
 *
 * Reads EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY from mobile/.env.
 * Service role is pulled at runtime from `supabase projects api-keys` (CLI must be
 * logged in + project linked) or from SUPABASE_SERVICE_ROLE_KEY in the env.
 *
 * Usage (run from mobile/):
 *   node scripts/_auth-admin.mjs diag <email>
 *   node scripts/_auth-admin.mjs confirm <email>          # admin-confirm email (unblock sign-in)
 *   node scripts/_auth-admin.mjs send-confirm <email> <password>  # public signup -> sends real confirm email
 *   node scripts/_auth-admin.mjs inspect-link <email>     # admin generate_link, print redirect_to (no email sent)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');

const raw = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}

function linkedProjectRef() {
  try {
    const p = path.join(__dirname, '..', '..', 'supabase', '.temp', 'linked-project.json');
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return j.ref || null;
  } catch {
    return null;
  }
}

function serviceKeyFromCli(ref) {
  const out = execSync(`supabase projects api-keys --project-ref ${ref} -o json`, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const keys = JSON.parse(out);
  const list = Array.isArray(keys) ? keys : keys?.keys ?? [];
  const row = list.find((k) => String(k.name || k.id || '').includes('service'));
  return row?.api_key ?? row?.key ?? null;
}

const ref = linkedProjectRef();
const url = env.EXPO_PUBLIC_SUPABASE_URL || (ref ? `https://${ref}.supabase.co` : null);
const anon = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
let service = env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY;
if (!service && ref) {
  try {
    service = serviceKeyFromCli(ref);
  } catch (e) {
    console.error('Could not get service role from Supabase CLI:', e?.message ?? e);
  }
}
if (!url || !service) {
  console.error('Need EXPO_PUBLIC_SUPABASE_URL and service role (env or `supabase login` + linked project).');
  process.exit(1);
}

const adminHeaders = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' };

async function findUser(email) {
  const target = email.toLowerCase();
  let page = 1;
  while (page <= 25) {
    const r = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: adminHeaders });
    if (!r.ok) {
      console.error('admin/users HTTP', r.status, await r.text());
      process.exit(2);
    }
    const j = await r.json();
    const users = j.users || [];
    const u = users.find((x) => (x.email || '').toLowerCase() === target);
    if (u) return u;
    if (users.length < 200) break;
    page += 1;
  }
  return null;
}

function summary(u) {
  return {
    id: u.id,
    email: u.email,
    created_at: u.created_at,
    email_confirmed_at: u.email_confirmed_at ?? null,
    confirmed_at: u.confirmed_at ?? null,
    confirmation_sent_at: u.confirmation_sent_at ?? null,
    last_sign_in_at: u.last_sign_in_at ?? null,
    providers: (u.identities || []).map((i) => i.provider),
    banned_until: u.banned_until ?? null,
  };
}

const [cmd, email, password] = process.argv.slice(2);

if (!cmd || !email) {
  console.error('Usage: node scripts/_auth-admin.mjs <diag|confirm|send-confirm|inspect-link> <email> [password]');
  process.exit(1);
}

if (cmd === 'diag') {
  const u = await findUser(email);
  if (!u) {
    console.log(JSON.stringify({ email, found: false }, null, 2));
    process.exit(0);
  }
  console.log(JSON.stringify({ found: true, ...summary(u) }, null, 2));
} else if (cmd === 'confirm') {
  const u = await findUser(email);
  if (!u) {
    console.error(`No user ${email}`);
    process.exit(3);
  }
  const r = await fetch(`${url}/auth/v1/admin/users/${u.id}`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({ email_confirm: true }),
  });
  const body = await r.json();
  console.log(JSON.stringify({ action: 'confirm', ok: r.ok, status: r.status, after: summary(body) }, null, 2));
} else if (cmd === 'inspect-link') {
  const r = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ type: 'signup', email, password: password || `Tmp_${Math.random().toString(36).slice(2)}A1!` }),
  });
  const body = await r.json();
  const link = body?.action_link || body?.properties?.action_link || null;
  let redirect_to = null;
  try {
    redirect_to = link ? new URL(link).searchParams.get('redirect_to') : null;
  } catch {}
  console.log(JSON.stringify({ ok: r.ok, status: r.status, action_link: link, redirect_to, raw: r.ok ? undefined : body }, null, 2));
} else if (cmd === 'send-confirm') {
  if (!password) {
    console.error('send-confirm needs a password: node scripts/_auth-admin.mjs send-confirm <email> <password>');
    process.exit(1);
  }
  if (!anon) {
    console.error('Missing EXPO_PUBLIC_SUPABASE_ANON_KEY in mobile/.env');
    process.exit(1);
  }
  const r = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const text = await r.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { _raw: text };
  }
  if (!r.ok) {
    console.error('signup HTTP', r.status, text);
  }
  console.log(
    JSON.stringify(
      {
        action: 'send-confirm',
        http_ok: r.ok,
        status: r.status,
        user_id: body?.id || body?.user?.id || null,
        confirmation_sent_at: body?.confirmation_sent_at ?? body?.user?.confirmation_sent_at ?? null,
        email_confirmed_at: body?.email_confirmed_at ?? body?.user?.email_confirmed_at ?? null,
        msg: body?.msg || body?.error_description || body?.error || undefined,
      },
      null,
      2,
    ),
  );
} else if (cmd === 'signin') {
  if (!password) {
    console.error('signin needs a password: node scripts/_auth-admin.mjs signin <email> <password>');
    process.exit(1);
  }
  const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await r.json();
  console.log(
    JSON.stringify(
      {
        action: 'signin',
        http_ok: r.ok,
        status: r.status,
        got_session: Boolean(body?.access_token),
        user_id: body?.user?.id ?? null,
        email_confirmed_at: body?.user?.email_confirmed_at ?? null,
        error: body?.error_description || body?.error || body?.msg || undefined,
      },
      null,
      2,
    ),
  );
} else {
  console.error(`Unknown command: ${cmd}`);
  process.exit(1);
}
