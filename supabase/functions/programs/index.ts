import { z } from "https://esm.sh/zod@3";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  corsHeaders,
  generateRequestId,
  errorResponse,
  successResponse,
} from "../_shared/response.ts";
import { getUser } from "../_shared/auth.ts";
import { requireEntitlement } from "../_shared/entitlement.ts";
import { checkRateLimit } from "../_shared/ratelimit.ts";
import { resolveLocalTodayYmd } from "../_shared/client_day.ts";

// The original live program. Used only as the default active program when a
// profile has no active_program_id set (legacy rows backfilled by migration).
const SPRINT_PROGRAM_ID = "b0000000-0000-0000-0000-000000000001";
// Matches lessons/index.ts PROGRAM_VERSION — the schedule this program_id uses.
const PROGRAM_VERSION = "v1";

// Coach photos are uploaded by the loader into the lesson-audio bucket
// (no dedicated image bucket yet — see scripts/03_loader.py IMAGE_BUCKET).
const IMAGE_BUCKET = "lesson-audio";
const SIGNED_URL_TTL = 3600; // 1 hour

const SelectBodySchema = z.object({
  program_id: z.string().uuid(),
  mode: z.enum(["continue", "restart"]),
}).strict();

// GET /programs        — programs (excluding the user's ACTIVE one) for the Home
//                        "More programs you might like" rail. Non-dev users only
//                        ever see production_ready programs; is_dev accounts also
//                        see preview ones. Each row carries the user's per-pack
//                        progress (started / current_day) so the client can offer
//                        Continue vs Restart.
// POST /programs/select — switch the active pack { program_id, mode }.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = generateRequestId();

  if (req.method !== "GET" && req.method !== "POST") {
    return errorResponse(405, "VALIDATION_ERROR", "Method not allowed", requestId);
  }

  const supabase = createServiceClient();
  const auth = await getUser(req, supabase, requestId);
  if (!auth.ok) return auth.response;

  const rl = await checkRateLimit(
    auth.userId,
    requestId,
    req.method === "GET" ? "authenticated-read" : "authenticated-write",
  );
  if (!rl.ok) return rl.response;

  const entitlement = await requireEntitlement(supabase, auth.userId, requestId);
  if (!entitlement.ok) return entitlement.response;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_dev, active_program_id, current_program_day")
    .eq("id", auth.userId)
    .maybeSingle();
  const isDev = profile?.is_dev === true;
  const activeProgramId = (profile?.active_program_id as string | null) ?? SPRINT_PROGRAM_ID;
  const activeProgramDay = typeof profile?.current_program_day === "number"
    ? profile.current_program_day
    : 1;

  const url = new URL(req.url);

  if (req.method === "POST") {
    if (!/\/programs\/select\/?$/.test(url.pathname)) {
      return errorResponse(405, "VALIDATION_ERROR", "Method not allowed for this path", requestId);
    }
    return handleSelect(req, supabase, auth.userId, isDev, requestId);
  }

  // Additive route: GET /programs/:uuid — full lesson list + per-lesson
  // completion for the Library pack detail screen. Existing GET /programs
  // clients never hit this path.
  const detailMatch = url.pathname.match(/\/programs\/([0-9a-f-]{36})\/?$/i);
  if (detailMatch) {
    return handleDetail(
      supabase,
      auth.userId,
      isDev,
      activeProgramId,
      activeProgramDay,
      detailMatch[1],
      requestId,
    );
  }

  // Additive: shipped app builds never send this param, so their response
  // stays byte-for-byte identical (active pack excluded, no is_active/total_days).
  const includeActive = url.searchParams.get("include_active") === "1";

  return handleList(
    supabase,
    auth.userId,
    isDev,
    activeProgramId,
    requestId,
    includeActive,
    activeProgramDay,
  );
});

// ---------------------------------------------------------------------------
// GET /programs
// ---------------------------------------------------------------------------
async function handleList(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  isDev: boolean,
  activeProgramId: string,
  requestId: string,
  includeActive = false,
  activeProgramDay = 1,
): Promise<Response> {
  let query = supabase
    .from("programs")
    .select("id, title, sport, coach_id, cover_image")
    .eq("published", true);
  if (!includeActive) query = query.neq("id", activeProgramId);
  if (!isDev) query = query.eq("production_ready", true);

  const { data: programs, error } = await query.order("created_at", {
    ascending: true,
  });
  if (error) {
    return errorResponse(500, "INTERNAL_ERROR", "Failed to fetch programs", requestId);
  }

  const programIds = (programs ?? []).map((p: { id: string }) => p.id);

  // Day-1 lesson per program, so the client can open a program's first
  // workout directly. Preview lessons stay gated by the lesson detail
  // endpoint itself (404 for non-dev users), and programs without lessons
  // (e.g. demo rows) simply get null.
  const { data: day1Lessons } = programIds.length > 0
    ? await supabase
        .from("lessons")
        .select("id, program_id")
        .in("program_id", programIds)
        .eq("sequence", 1)
        .eq("published", true)
    : { data: [] };
  const day1ByProgram = new Map(
    (day1Lessons ?? []).map((l: { id: string; program_id: string }) => [
      l.program_id,
      l.id,
    ]),
  );

  // Per-pack progress so the client can offer Continue vs Restart.
  const { data: states } = programIds.length > 0
    ? await supabase
        .from("user_program_state")
        .select("program_id, current_day, started")
        .eq("user_id", userId)
        .in("program_id", programIds)
    : { data: [] };
  const stateByProgram = new Map(
    (states ?? []).map((s: { program_id: string; current_day: number; started: boolean }) => [
      s.program_id,
      s,
    ]),
  );

  // Pack length for progress display — only fetched when include_active=1
  // (additive; unused by the default response). Mirrors the approach in
  // lessons/index.ts loadCoachAndProgram: count of published lessons in the
  // pack, with the Sprint using its program_schedule length instead (same
  // source resolveProgramDayLessonId uses for the live daily-WOD path).
  //
  // The same pass also tracks each pack's final lesson (max sequence) so we
  // can tell whether the user has completed the pack — a program with no
  // lessons has no final lesson id and is therefore never "completed".
  const totalDaysByProgram = new Map<string, number>();
  const finalLessonByProgram = new Map<string, string>();
  if (includeActive && programIds.length > 0) {
    const maxSeqByProgram = new Map<string, number>();
    const { data: lessonRows } = await supabase
      .from("lessons")
      .select("program_id, id, sequence")
      .in("program_id", programIds)
      .eq("published", true);
    for (const row of lessonRows ?? []) {
      const pid = row.program_id as string;
      totalDaysByProgram.set(pid, (totalDaysByProgram.get(pid) ?? 0) + 1);
      const seq = row.sequence as number;
      if (seq > (maxSeqByProgram.get(pid) ?? -Infinity)) {
        maxSeqByProgram.set(pid, seq);
        finalLessonByProgram.set(pid, row.id as string);
      }
    }
    if (programIds.includes(SPRINT_PROGRAM_ID)) {
      const { count: scheduleCount } = await supabase
        .from("program_schedule")
        .select("day_number", { count: "exact", head: true })
        .eq("program_version", PROGRAM_VERSION);
      if (typeof scheduleCount === "number" && scheduleCount > 0) {
        totalDaysByProgram.set(SPRINT_PROGRAM_ID, scheduleCount);
      }
      // The Sprint's final lesson is defined by its schedule (max day_number),
      // not lessons.sequence — override whatever the pass above found.
      const { data: finalSchedRow } = await supabase
        .from("program_schedule")
        .select("lesson_id")
        .eq("program_version", PROGRAM_VERSION)
        .order("day_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (finalSchedRow?.lesson_id) {
        finalLessonByProgram.set(SPRINT_PROGRAM_ID, finalSchedRow.lesson_id as string);
      }
    }
  }

  // Completed = the user has a completion row for the pack's final lesson.
  const completedByProgram = new Map<string, boolean>();
  if (includeActive && finalLessonByProgram.size > 0) {
    const finalLessonIds = [...new Set(finalLessonByProgram.values())];
    const { data: finalCompletions } = await supabase
      .from("user_lesson_completions")
      .select("lesson_id")
      .eq("user_id", userId)
      .in("lesson_id", finalLessonIds);
    const completedLessonIds = new Set(
      (finalCompletions ?? []).map((c: { lesson_id: string }) => c.lesson_id),
    );
    for (const [pid, lessonId] of finalLessonByProgram) {
      completedByProgram.set(pid, completedLessonIds.has(lessonId));
    }
  }

  const coachIds = [
    ...new Set((programs ?? []).map((p: { coach_id: string }) => p.coach_id)),
  ];
  const { data: coaches } = coachIds.length > 0
    ? await supabase
        .from("coaches")
        .select("id, name, sport, avatar_url")
        .in("id", coachIds)
    : { data: [] };
  const coachById = new Map(
    (coaches ?? []).map((c: { id: string }) => [c.id, c]),
  );

  const items = await Promise.all(
    (programs ?? []).map(async (p: Record<string, unknown>) => {
      const coach = coachById.get(p.coach_id as string) as
        | { name?: string; sport?: string | null; avatar_url?: string | null }
        | undefined;

      let avatarUrl = coach?.avatar_url ?? null;
      if (avatarUrl && !/^https?:\/\//i.test(avatarUrl)) {
        const { data: signed } = await supabase.storage
          .from(IMAGE_BUCKET)
          .createSignedUrl(avatarUrl, SIGNED_URL_TTL);
        avatarUrl = signed?.signedUrl ?? null;
      }

      const state = stateByProgram.get(p.id as string);
      const isActiveProgram = includeActive && p.id === activeProgramId;

      // For the ACTIVE pack the profile pointer (current_program_day) is the
      // live source of truth — it drives /lessons/next. The per-pack state row
      // can lag it (it was only mirrored on select/completion after the
      // program-switching migrations), so profile wins for the active pack;
      // state is used for every other pack.
      const currentDay = isActiveProgram
        ? activeProgramDay
        : (state?.current_day as number | null) ?? null;
      const started = state?.started === true || isActiveProgram;

      // Completed = the user finished the pack's final lesson at least once.
      // Deliberately sticky across restarts (completions are never deleted;
      // a finished pack stays "Completed" in the Library) — the client shows
      // day progress instead of the badge while the pack is actively being
      // redone (is_active && current_day < total_days).
      const packTotal = totalDaysByProgram.get(p.id as string) ?? null;
      const completed = completedByProgram.get(p.id as string) ?? false;

      return {
        id: p.id,
        title: p.title,
        coach_name: coach?.name ?? "",
        coach_sport: coach?.sport ?? (p.sport as string | null) ?? null,
        coach_avatar_url: avatarUrl,
        day1_lesson_id: day1ByProgram.get(p.id as string) ?? null,
        started,
        current_day: currentDay,
        ...(includeActive
          ? {
            is_active: isActiveProgram,
            total_days: packTotal,
            cover_image: (p.cover_image as string | null) ?? null,
            completed,
          }
          : {}),
      };
    }),
  );

  return successResponse({ items }, requestId);
}

// ---------------------------------------------------------------------------
// GET /programs/:uuid — pack detail with ordered lessons + completion flags.
// ---------------------------------------------------------------------------
async function handleDetail(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  isDev: boolean,
  activeProgramId: string,
  activeProgramDay: number,
  programId: string,
  requestId: string,
): Promise<Response> {
  const parsed = z.string().uuid().safeParse(programId);
  if (!parsed.success) {
    return errorResponse(400, "VALIDATION_ERROR", "Invalid program ID", requestId);
  }

  const { data: program, error: progErr } = await supabase
    .from("programs")
    .select("id, title, sport, coach_id, cover_image, published, production_ready")
    .eq("id", parsed.data)
    .maybeSingle();

  if (progErr || !program || program.published !== true) {
    return errorResponse(404, "NOT_FOUND", "Program not found", requestId);
  }
  if (program.production_ready !== true && !isDev) {
    return errorResponse(404, "NOT_FOUND", "Program not found", requestId);
  }

  const { data: coachRow } = await supabase
    .from("coaches")
    .select("name, sport, avatar_url")
    .eq("id", program.coach_id as string)
    .maybeSingle();

  let avatarUrl = (coachRow?.avatar_url as string | null) ?? null;
  if (avatarUrl && !/^https?:\/\//i.test(avatarUrl)) {
    const { data: signed } = await supabase.storage
      .from(IMAGE_BUCKET)
      .createSignedUrl(avatarUrl, SIGNED_URL_TTL);
    avatarUrl = signed?.signedUrl ?? null;
  }

  const { data: state } = await supabase
    .from("user_program_state")
    .select("current_day, started")
    .eq("user_id", userId)
    .eq("program_id", parsed.data)
    .maybeSingle();

  const isActiveProgram = parsed.data === activeProgramId;
  // Active pack: the profile pointer is the live truth (drives /lessons/next);
  // the state row can lag it. Mirrors handleList.
  const currentDay = isActiveProgram
    ? activeProgramDay
    : typeof state?.current_day === "number"
      ? state.current_day
      : null;
  const started = state?.started === true || isActiveProgram;

  type LessonRow = {
    id: string;
    title: string;
    duration_seconds: number;
    day: number;
  };

  let lessonRows: LessonRow[] = [];
  let finalLessonId: string | null = null;

  if (parsed.data === SPRINT_PROGRAM_ID) {
    const { data: schedRows } = await supabase
      .from("program_schedule")
      .select("day_number, lesson_id")
      .eq("program_version", PROGRAM_VERSION)
      .order("day_number", { ascending: true });

    const schedLessonIds = (schedRows ?? []).map((r: { lesson_id: string }) => r.lesson_id);
    let lessonsQuery = supabase
      .from("lessons")
      .select("id, title, duration_seconds")
      .in("id", schedLessonIds.length > 0 ? schedLessonIds : ["00000000-0000-0000-0000-000000000000"])
      .eq("published", true);
    if (!isDev) lessonsQuery = lessonsQuery.eq("production_ready", true);
    const { data: metaRows } = await lessonsQuery;
    const metaById = new Map(
      (metaRows ?? []).map((l: { id: string; title: string; duration_seconds: number }) => [l.id, l]),
    );

    for (const row of schedRows ?? []) {
      const lid = row.lesson_id as string;
      const meta = metaById.get(lid);
      if (!meta) continue;
      lessonRows.push({
        id: lid,
        title: meta.title,
        duration_seconds: meta.duration_seconds,
        day: row.day_number as number,
      });
    }
    if (lessonRows.length > 0) {
      finalLessonId = lessonRows[lessonRows.length - 1].id;
    }
  } else {
    let lessonsQuery = supabase
      .from("lessons")
      .select("id, title, duration_seconds, sequence")
      .eq("program_id", parsed.data)
      .eq("published", true)
      .order("sequence", { ascending: true });
    if (!isDev) lessonsQuery = lessonsQuery.eq("production_ready", true);
    const { data: rows } = await lessonsQuery;

    lessonRows = (rows ?? []).map((l: {
      id: string;
      title: string;
      duration_seconds: number;
      sequence: number;
    }) => ({
      id: l.id,
      title: l.title,
      duration_seconds: l.duration_seconds,
      day: l.sequence,
    }));
    if (lessonRows.length > 0) {
      finalLessonId = lessonRows[lessonRows.length - 1].id;
    }
  }

  const lessonIds = lessonRows.map((l) => l.id);
  const { data: completions } = lessonIds.length > 0
    ? await supabase
        .from("user_lesson_completions")
        .select("lesson_id")
        .eq("user_id", userId)
        .in("lesson_id", lessonIds)
    : { data: [] };
  const completedSet = new Set(
    (completions ?? []).map((c: { lesson_id: string }) => c.lesson_id),
  );

  const completedCount = lessonRows.filter((l) => completedSet.has(l.id)).length;
  const totalDays = lessonRows.length > 0 ? lessonRows.length : null;
  // Sticky across restarts, same as handleList: once the final lesson has a
  // completion row the pack counts as completed. The client de-emphasizes the
  // badge while the pack is actively being redone.
  const packCompleted = finalLessonId != null && completedSet.has(finalLessonId);

  const lessons = lessonRows.map((l) => ({
    id: l.id,
    title: l.title,
    duration_seconds: l.duration_seconds,
    day: l.day,
    completed: completedSet.has(l.id),
    is_current: isActiveProgram && typeof currentDay === "number" && l.day === currentDay,
  }));

  return successResponse(
    {
      id: program.id,
      title: program.title,
      coach_name: coachRow?.name ?? "",
      coach_sport: coachRow?.sport ?? (program.sport as string | null) ?? null,
      coach_avatar_url: avatarUrl,
      cover_image: (program.cover_image as string | null) ?? null,
      started,
      current_day: currentDay,
      is_active: isActiveProgram,
      total_days: totalDays,
      completed: packCompleted,
      completed_count: completedCount,
      lessons,
    },
    requestId,
  );
}

// ---------------------------------------------------------------------------
// POST /programs/select — make { program_id } the active pack.
//   mode = "continue" -> resume the stored day (back-dating program_start_date
//                        so today's lesson is immediately available).
//   mode = "restart"  -> back to day 1, anchored at today. Completions are NOT
//                        deleted; they remain in the Library.
// ---------------------------------------------------------------------------
async function handleSelect(
  req: Request,
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  isDev: boolean,
  requestId: string,
): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "VALIDATION_ERROR", "Invalid JSON body", requestId);
  }

  const parsed = SelectBodySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "VALIDATION_ERROR", "program_id (uuid) and mode (continue|restart) are required", requestId);
  }
  const { program_id, mode } = parsed.data;

  // Validate the target program is servable to this user.
  const { data: program } = await supabase
    .from("programs")
    .select("id, published, production_ready")
    .eq("id", program_id)
    .maybeSingle();

  if (!program || program.published !== true) {
    return errorResponse(404, "NOT_FOUND", "Program not found", requestId);
  }
  if (program.production_ready !== true && !isDev) {
    return errorResponse(404, "NOT_FOUND", "Program not found", requestId);
  }

  const localToday = resolveLocalTodayYmd(req);

  // Resolve the day to resume at.
  let resumeDay = 1;
  if (mode === "continue") {
    const { data: state } = await supabase
      .from("user_program_state")
      .select("current_day")
      .eq("user_id", userId)
      .eq("program_id", program_id)
      .maybeSingle();
    resumeDay = Math.max((state?.current_day as number | null) ?? 1, 1);
  }

  // Guard: don't switch into a pack with no startable lesson at the resume day
  // (would leave the user on an empty Workout-of-the-Day). The sprint resolves
  // via program_schedule and is always valid.
  if (program_id !== SPRINT_PROGRAM_ID) {
    const { data: startLesson } = await supabase
      .from("lessons")
      .select("id")
      .eq("program_id", program_id)
      .eq("sequence", resumeDay)
      .eq("published", true)
      .maybeSingle();
    if (!startLesson) {
      return errorResponse(409, "PROGRAM_NOT_READY", "This program has no lessons yet", requestId);
    }
  }

  // Back-date program_start_date so the catch-up gate (day > elapsed) does not
  // hide today's lesson: elapsed must be >= resumeDay, so start = today-(day-1).
  const startDate = subtractDaysYmd(localToday, resumeDay - 1);

  const { error: profileErr } = await supabase
    .from("profiles")
    .update({
      active_program_id: program_id,
      current_program_day: resumeDay,
      program_start_date: startDate,
      last_wod_completion_local_date: null,
    })
    .eq("id", userId);

  if (profileErr) {
    return errorResponse(500, "INTERNAL_ERROR", "Failed to switch program", requestId);
  }

  // Mirror into per-pack state. Preserve the earliest started_local_date on
  // continue; reset to today on restart's first row.
  const { error: stateErr } = await supabase
    .from("user_program_state")
    .upsert(
      {
        user_id: userId,
        program_id,
        current_day: resumeDay,
        started: true,
        started_local_date: startDate,
      },
      { onConflict: "user_id,program_id" },
    );

  if (stateErr) {
    return errorResponse(500, "INTERNAL_ERROR", "Failed to record program state", requestId);
  }

  return successResponse(
    { active_program_id: program_id, current_day: resumeDay, mode },
    requestId,
  );
}

// Subtract whole days from a YYYY-MM-DD string in UTC (calendar-stable).
function subtractDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - Math.max(days, 0));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
