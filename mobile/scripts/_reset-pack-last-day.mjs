/**
 * QA: put one user on the LAST day of every lesson pack, with that last
 * lesson uncompleted, so the first-time pack-complete + rating flow can fire.
 *
 * Does not print secrets. Service role comes from env or `supabase projects api-keys`.
 *
 * Run from mobile/:
 *   node scripts/_reset-pack-last-day.mjs rkumar875675@gmail.com
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');
const email = (process.argv[2] || '').trim().toLowerCase();
if (!email) {
  console.error('Usage: node scripts/_reset-pack-last-day.mjs <email>');
  process.exit(1);
}

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
  const labels = list.map((k) => ({
    name: k.name ?? null,
    id: k.id ?? null,
    type: k.type ?? null,
  }));
  const row = list.find((k) => {
    const blob = `${k.name || ''} ${k.id || ''} ${k.type || ''}`;
    return /secret/i.test(blob) && !/service_role/i.test(blob);
  });
  if (!row) {
    console.error('No sb_secret key in CLI listing. Names only:', labels);
    return null;
  }
  return row.api_key ?? row.key ?? row.secret ?? null;
}

const ref = linkedProjectRef();
let url = env.EXPO_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
if (!url && ref) url = `https://${ref}.supabase.co`;

let service = null;
if (ref) {
  try {
    service = serviceKeyFromCli(ref);
  } catch (e) {
    console.error('Could not get service role from Supabase CLI:', e?.message ?? e);
  }
}
if (!service) {
  service = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY;
}

if (!url || !service) {
  console.error('Need EXPO_PUBLIC_SUPABASE_URL and a service role (env or supabase login + linked project).');
  process.exit(1);
}

const headers = {
  apikey: service,
  Authorization: `Bearer ${service}`,
  'Content-Type': 'application/json',
};

async function rest(pathname, init = {}) {
  const r = await fetch(`${url}${pathname}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  });
  const text = await r.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!r.ok) {
    throw new Error(`${init.method || 'GET'} ${pathname} → ${r.status} ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return body;
}

let user = null;
let page = 1;
while (!user && page <= 20) {
  const j = await rest(`/auth/v1/admin/users?page=${page}&per_page=200`);
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
const [programs, lessons, profileRows] = await Promise.all([
  rest('/rest/v1/programs?select=id,title,program_key,published'),
  rest('/rest/v1/lessons?select=id,program_id,sequence,published&published=eq.true'),
  rest(`/rest/v1/profiles?id=eq.${uid}&select=id,is_dev,active_program_id,current_program_day,program_start_date,last_wod_completion_local_date`),
]);

const profile = profileRows?.[0];
if (!profile) {
  console.error('No profile row for user');
  process.exit(4);
}

const lastByProgram = new Map();
for (const lesson of lessons || []) {
  if (!lesson.program_id || typeof lesson.sequence !== 'number') continue;
  const prev = lastByProgram.get(lesson.program_id);
  if (!prev || lesson.sequence > prev.sequence) {
    lastByProgram.set(lesson.program_id, { lessonId: lesson.id, sequence: lesson.sequence });
  }
}

const startDate = new Date();
startDate.setUTCDate(startDate.getUTCDate() - 60);
const startedLocal = startDate.toISOString().slice(0, 10);

const packs = [];
for (const program of programs || []) {
  const last = lastByProgram.get(program.id);
  if (!last) continue;
  packs.push({
    id: program.id,
    title: program.title,
    key: program.program_key,
    lastDay: last.sequence,
    lastLessonId: last.lessonId,
  });
}

const lastLessonIds = packs.map((p) => p.lastLessonId);
let deletedCompletions = 0;
if (lastLessonIds.length) {
  const existing = await rest(
    `/rest/v1/user_lesson_completions?user_id=eq.${uid}&lesson_id=in.(${lastLessonIds.join(',')})&select=id`,
  );
  deletedCompletions = Array.isArray(existing) ? existing.length : 0;
  if (deletedCompletions > 0) {
    await rest(
      `/rest/v1/user_lesson_completions?user_id=eq.${uid}&lesson_id=in.(${lastLessonIds.join(',')})`,
      { method: 'DELETE' },
    );
  }
}

const existingRatings = await rest(`/rest/v1/program_ratings?user_id=eq.${uid}&select=id`);
const deletedRatings = Array.isArray(existingRatings) ? existingRatings.length : 0;
if (deletedRatings > 0) {
  await rest(`/rest/v1/program_ratings?user_id=eq.${uid}`, { method: 'DELETE' });
}

const stateRows = packs.map((p) => ({
  user_id: uid,
  program_id: p.id,
  current_day: p.lastDay,
  started: true,
  started_local_date: startedLocal,
}));
if (stateRows.length) {
  await rest('/rest/v1/user_program_state?on_conflict=user_id,program_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(stateRows),
  });
}

const activeId = profile.active_program_id;
const activePack = packs.find((p) => p.id === activeId) ?? packs[0];
if (activePack) {
  await rest(`/rest/v1/profiles?id=eq.${uid}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      current_program_day: activePack.lastDay,
      program_start_date: startedLocal,
      last_wod_completion_local_date: null,
      ...(activeId ? {} : { active_program_id: activePack.id }),
    }),
  });
}

console.log(JSON.stringify({
  email: user.email,
  user_id: uid,
  is_dev: profile.is_dev === true,
  active_program_id: activePack?.id ?? null,
  active_program_title: activePack?.title ?? null,
  active_program_day: activePack?.lastDay ?? null,
  packs_set_to_last_day: packs.map((p) => ({
    title: p.title,
    last_day: p.lastDay,
  })),
  last_lesson_completions_deleted: deletedCompletions,
  program_ratings_deleted: deletedRatings,
}, null, 2));
