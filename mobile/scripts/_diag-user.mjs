/**
 * Diagnostic: find user by email, print non-secret DB state.
 * Uses EXPO_PUBLIC_SUPABASE_URL from mobile/.env; service role from .env
 * or `supabase projects api-keys` (CLI must be logged in).
 *
 * Run from mobile/: node scripts/_diag-user.mjs m@gmail.com
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');
const email = (process.argv[2] || '').trim().toLowerCase();
if (!email) {
  console.error('Usage: node scripts/_diag-user.mjs <email>');
  process.exit(1);
}

const raw = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const line of raw.split('\n')) {
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
let url = env.EXPO_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
if (!url && ref) url = `https://${ref}.supabase.co`;

let service = env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY;
if (!service && ref) {
  try {
    service = serviceKeyFromCli(ref);
  } catch (e) {
    console.error('Could not get service role from Supabase CLI:', e?.message ?? e);
  }
}

if (!url || !service) {
  console.error(
    'Need EXPO_PUBLIC_SUPABASE_URL (or linked supabase project) and service role (.env SUPABASE_SERVICE_ROLE_KEY or `supabase login` + linked project).',
  );
  process.exit(1);
}

const headers = {
  apikey: service,
  Authorization: `Bearer ${service}`,
  'Content-Type': 'application/json',
};

let user = null;
let page = 1;
while (!user && page <= 20) {
  const r = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=200`, { headers });
  if (!r.ok) {
    console.error('Admin users HTTP', r.status, await r.text());
    process.exit(2);
  }
  const j = await r.json();
  const users = j.users || [];
  user = users.find((u) => (u.email || '').toLowerCase() === email);
  if (users.length < 200) break;
  page += 1;
}

if (!user) {
  console.error(`No user found with email ${email}`);
  process.exit(3);
}

const uid = user.id;

async function rest(path, extraHeaders = {}) {
  const r = await fetch(`${url}${path}`, {
    headers: { ...headers, ...extraHeaders },
  });
  const text = await r.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { ok: r.ok, status: r.status, headers: r.headers, body };
}

const [profRes, upRes, stRes, jnRes, ulcRes] = await Promise.all([
  rest(`/rest/v1/profiles?id=eq.${uid}&select=id,is_dev,onboarding_completed,current_program_day,last_wod_completion_local_date,freebie_used,program_start_date`),
  rest(`/rest/v1/user_progress?user_id=eq.${uid}&select=user_id,mindfulness_score,acceptance_score,commitment_score,last_decay_applied_local_date`),
  rest(`/rest/v1/user_streaks?user_id=eq.${uid}&select=user_id,current_streak,longest_streak,last_activity_date`),
  rest(`/rest/v1/journal_entries?user_id=eq.${uid}&select=id`, {
    Prefer: 'count=exact',
    Range: '0-0',
  }),
  rest(`/rest/v1/user_lesson_completions?user_id=eq.${uid}&select=id`, {
    Prefer: 'count=exact',
    Range: '0-0',
  }),
]);

function countFromRange(h) {
  const cr = h.get('content-range');
  if (!cr) return null;
  const m = cr.match(/\/(\d+)$/);
  return m ? Number(m[1]) : null;
}

const out = {
  user_id: uid,
  email: user.email,
  created_at: user.created_at,
  last_sign_in_at: user.last_sign_in_at,
  profile: profRes.body?.[0] ?? profRes.body,
  user_progress: upRes.body?.[0] ?? upRes.body,
  user_streaks: stRes.body?.[0] ?? stRes.body,
  journal_entry_count: countFromRange(jnRes.headers),
  lesson_completion_count: countFromRange(ulcRes.headers),
  rest_ok: {
    profiles: profRes.ok,
    user_progress: upRes.ok,
    user_streaks: stRes.ok,
    journal_entries: jnRes.ok,
    user_lesson_completions: ulcRes.ok,
  },
};

console.log(JSON.stringify(out, null, 2));
