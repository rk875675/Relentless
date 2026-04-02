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
import {
  checkIdempotencyKey,
  storeIdempotencyKey,
} from "../_shared/idempotency.ts";
import { checkRateLimit } from "../_shared/ratelimit.ts";
import { computeLibraryUnlocked, calendarDaysInclusiveYmd } from "../_shared/library.ts";
import { parseProgramAnchor, resolveLocalTodayYmd } from "../_shared/client_day.ts";
import { ensureProgramStartIfHome } from "../_shared/program_start.ts";
import {
  type MacScores,
  type MacDeltas,
  computeGain,
  applyGain,
  applyDecay,
  decayGapDays,
  missedWodDaysInGap,
  yesterdayYmd,
} from "../_shared/scoring.ts";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
});

const UuidSchema = z.string().uuid();

const METADATA_COLUMNS =
  "id, coach_id, title, duration_seconds, lesson_type, sort_order";
const DETAIL_COLUMNS =
  "id, coach_id, title, duration_seconds, lesson_type, voiceover_url, on_screen_text, reflection_prompt, content_blocks, sort_order";

const PROGRAM_VERSION = "v1";
const AUDIO_BUCKET = "lesson-audio";
const SIGNED_URL_TTL = 3600; // 1 hour

// ---------------------------------------------------------------------------
// Resolve storage paths inside content_blocks to signed URLs
// ---------------------------------------------------------------------------
async function resolveContentBlockUrls(
  supabase: ReturnType<typeof createServiceClient>,
  lesson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const cb = lesson.content_blocks as { blocks: Record<string, unknown>[] } | null;
  if (!cb?.blocks) return lesson;

  const pathsToSign: string[] = [];
  for (const block of cb.blocks) {
    if (block.type === "voiceover") {
      for (const p of (block.audio_files as string[]) ?? []) pathsToSign.push(p);
    } else if (block.type === "timed_exercise") {
      if (block.ambient_audio) pathsToSign.push(block.ambient_audio as string);
    }
  }

  if (pathsToSign.length === 0) return lesson;

  const urlMap = new Map<string, string>();
  const results = await Promise.all(
    pathsToSign.map((p) =>
      supabase.storage.from(AUDIO_BUCKET).createSignedUrl(p, SIGNED_URL_TTL),
    ),
  );
  for (let i = 0; i < pathsToSign.length; i++) {
    const r = results[i];
    if (r.data?.signedUrl) urlMap.set(pathsToSign[i], r.data.signedUrl);
  }

  const resolved = structuredClone(cb);
  for (const block of resolved.blocks) {
    if (block.type === "voiceover") {
      block.audio_files = ((block.audio_files as string[]) ?? []).map(
        (p: string) => urlMap.get(p) ?? p,
      );
    } else if (block.type === "timed_exercise" && block.ambient_audio) {
      block.ambient_audio = urlMap.get(block.ambient_audio as string) ?? block.ambient_audio;
    }
  }

  return { ...lesson, content_blocks: resolved };
}

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

  const url = new URL(req.url);
  const pathMatch = url.pathname.match(/\/lessons(?:\/(.+))?$/);
  const subPath = (pathMatch?.[1] ?? "").replace(/\/$/, "");

  if (req.method === "GET") {
    const localYmd = resolveLocalTodayYmd(req);
    const anchor = parseProgramAnchor(req);
    await ensureProgramStartIfHome(supabase, auth.userId, localYmd, anchor);

    if (subPath === "") {
      return handleList(url, supabase, auth.userId, requestId, localYmd);
    }
    if (subPath === "next") return handleNext(supabase, auth.userId, requestId, localYmd);
    return handleDetail(supabase, subPath, auth.userId, requestId, localYmd);
  }

  const completeMatch = subPath.match(/^([^/]+)\/complete$/);
  if (completeMatch) {
    return handleComplete(req, supabase, completeMatch[1], auth.userId, requestId);
  }
  return errorResponse(405, "VALIDATION_ERROR", "Method not allowed for this path", requestId);
});

// ---------------------------------------------------------------------------
// C1 — list published lessons (library must be unlocked)
// ---------------------------------------------------------------------------
async function handleList(
  url: URL,
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  requestId: string,
  localTodayYmd: string,
): Promise<Response> {
  const lock = await computeLibraryUnlocked(supabase, userId, localTodayYmd);
  if (!lock.unlocked) {
    const msg =
      lock.reason === "BEHIND"
        ? `Complete ${lock.remaining - 1} missed workout${lock.remaining - 1 > 1 ? "s" : ""} and today's to catch up and unlock the library.`
        : "Complete today's Daily Workout to unlock the library.";
    return errorResponse(403, "LIBRARY_LOCKED", msg, requestId);
  }

  const params = PaginationSchema.safeParse({
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!params.success) {
    return errorResponse(400, "VALIDATION_ERROR", params.error.issues[0]?.message ?? "Invalid query parameters", requestId);
  }

  const { page, limit } = params.data;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data: lessons, error, count } = await supabase
    .from("lessons")
    .select(METADATA_COLUMNS, { count: "exact" })
    .eq("published", true)
    .order("sort_order", { ascending: true })
    .range(from, to);

  if (error) {
    return errorResponse(500, "INTERNAL_ERROR", "Failed to fetch lessons", requestId);
  }

  const lessonIds = (lessons ?? []).map((l: { id: string }) => l.id);
  const { data: categories } =
    lessonIds.length > 0
      ? await supabase.from("lesson_categories").select("lesson_id, category").in("lesson_id", lessonIds)
      : { data: [] };

  const categoryMap = new Map<string, string[]>();
  for (const c of categories ?? []) {
    const arr = categoryMap.get(c.lesson_id) ?? [];
    arr.push(c.category);
    categoryMap.set(c.lesson_id, arr);
  }

  // Completed WODs get a "Day X" label when shown in the library.
  // Look up which lessons the user completed that are also in program_schedule.
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

  const { data: schedule } = await supabase
    .from("program_schedule")
    .select("day_number, lesson_id")
    .eq("program_version", PROGRAM_VERSION);

  // Build lesson_id → earliest day_number map, but only for unique WOD
  // lessons (not placeholder IDs shared across many days).
  const dayCountById = new Map<string, number>();
  const dayNumberById = new Map<string, number>();
  for (const row of schedule ?? []) {
    const lid = row.lesson_id as string;
    dayCountById.set(lid, (dayCountById.get(lid) ?? 0) + 1);
    const existing = dayNumberById.get(lid);
    if (existing === undefined || (row.day_number as number) < existing) {
      dayNumberById.set(lid, row.day_number as number);
    }
  }

  const items = (lessons ?? []).map((l: Record<string, unknown>) => {
    const lid = l.id as string;
    const isCompletedUniqueWod =
      completedSet.has(lid) &&
      dayCountById.has(lid) &&
      (dayCountById.get(lid) ?? 0) === 1;

    return {
      ...l,
      categories: categoryMap.get(lid) ?? [],
      program_day: isCompletedUniqueWod ? (dayNumberById.get(lid) ?? null) : null,
    };
  });

  // Regular lessons first (sort_order preserved), completed WODs at the bottom.
  const regular = items.filter((l) => l.program_day === null);
  const wods = items
    .filter((l) => l.program_day !== null)
    .sort((a, b) => (a.program_day as number) - (b.program_day as number));

  const sorted = [...regular, ...wods];

  return successResponse({ items: sorted, page, limit, total: count ?? 0 }, requestId);
}

// ---------------------------------------------------------------------------
// C2 — single lesson detail (WOD only while library is locked)
// ---------------------------------------------------------------------------
async function handleDetail(
  supabase: ReturnType<typeof createServiceClient>,
  id: string,
  userId: string,
  requestId: string,
  localTodayYmd: string,
): Promise<Response> {
  const parsed = UuidSchema.safeParse(id);
  if (!parsed.success) {
    return errorResponse(400, "VALIDATION_ERROR", "Invalid lesson ID format", requestId);
  }

  const lock = await computeLibraryUnlocked(supabase, userId, localTodayYmd);
  if (!lock.unlocked) {
    const wodId = await getCurrentWodLessonId(supabase, userId);
    const isCurrentWod = wodId != null && parsed.data === wodId;

    let isRepeatOfTodayWod = false;
    if (!isCurrentWod) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("last_wod_completion_local_date, current_program_day")
        .eq("id", userId)
        .single();
      if (prof?.last_wod_completion_local_date === localTodayYmd) {
        const prevDay = Math.max(1, (prof.current_program_day as number) - 1);
        const { data: prevSched } = await supabase
          .from("program_schedule")
          .select("lesson_id")
          .eq("program_version", PROGRAM_VERSION)
          .eq("day_number", prevDay)
          .maybeSingle();
        isRepeatOfTodayWod = prevSched?.lesson_id === parsed.data;
      }
    }

    if (!isCurrentWod && !isRepeatOfTodayWod) {
      const msg =
        lock.reason === "BEHIND"
          ? `Complete ${lock.remaining} workout${lock.remaining > 1 ? "s" : ""} to catch up. Start from the Home tab.`
          : "Complete today's Daily Workout first. Go to the Home tab.";
      return errorResponse(403, "WORKOUT_ONLY", msg, requestId);
    }
  }

  const { data: lesson, error } = await supabase
    .from("lessons")
    .select(DETAIL_COLUMNS)
    .eq("id", parsed.data)
    .eq("published", true)
    .single();

  if (error || !lesson) {
    return errorResponse(404, "NOT_FOUND", "Lesson not found", requestId);
  }

  const { data: categories } = await supabase
    .from("lesson_categories")
    .select("category")
    .eq("lesson_id", parsed.data);

  const enriched = await resolveContentBlockUrls(supabase, lesson as Record<string, unknown>);

  return successResponse(
    { ...enriched, categories: (categories ?? []).map((c: { category: string }) => c.category) },
    requestId,
  );
}

async function getCurrentWodLessonId(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
): Promise<string | null> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("current_program_day")
    .eq("id", userId)
    .single();
  if (error || !profile) return null;
  const day = profile.current_program_day as number;
  const { data: row } = await supabase
    .from("program_schedule")
    .select("lesson_id")
    .eq("program_version", PROGRAM_VERSION)
    .eq("day_number", day)
    .maybeSingle();
  return row?.lesson_id ?? null;
}

// ---------------------------------------------------------------------------
// helpers: repeat-lesson lookup + custom /next response envelope
// ---------------------------------------------------------------------------

async function lookupRepeatLesson(
  supabase: ReturnType<typeof createServiceClient>,
  completedDay: number,
): Promise<Record<string, unknown> | null> {
  if (completedDay < 1) return null;

  const { data: sched } = await supabase
    .from("program_schedule")
    .select("lesson_id")
    .eq("program_version", PROGRAM_VERSION)
    .eq("day_number", completedDay)
    .maybeSingle();

  if (!sched?.lesson_id) return null;

  const { data: lesson, error } = await supabase
    .from("lessons")
    .select(METADATA_COLUMNS)
    .eq("id", sched.lesson_id)
    .eq("published", true)
    .single();

  if (error || !lesson) return null;

  const { data: cats } = await supabase
    .from("lesson_categories")
    .select("category")
    .eq("lesson_id", lesson.id);

  return {
    ...lesson,
    program_day: completedDay,
    program_version: PROGRAM_VERSION,
    categories: (cats ?? []).map((c: { category: string }) => c.category),
  };
}

function nextLessonResponse(
  data: unknown,
  repeatLesson: Record<string, unknown> | null,
  requestId: string,
): Response {
  const body: Record<string, unknown> = { data, request_id: requestId };
  if (repeatLesson) body.repeat_lesson = repeatLesson;
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

// ---------------------------------------------------------------------------
// C3 — Daily Workout (next scheduled lesson)
// ---------------------------------------------------------------------------
async function handleNext(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  requestId: string,
  localTodayYmd: string,
): Promise<Response> {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("current_program_day, program_start_date, last_wod_completion_local_date")
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    return errorResponse(500, "INTERNAL_ERROR", "Failed to load program state", requestId);
  }

  const day = profile.current_program_day as number;
  const completedToday =
    (profile.last_wod_completion_local_date as string | null) === localTodayYmd;
  const completedDay = day - 1;

  if (profile.program_start_date) {
    const elapsed = calendarDaysInclusiveYmd(
      profile.program_start_date as string,
      localTodayYmd,
    );
    if (day > elapsed) {
      const repeatLesson =
        completedToday && completedDay >= 1
          ? await lookupRepeatLesson(supabase, completedDay)
          : null;
      return nextLessonResponse(null, repeatLesson, requestId);
    }
  }

  const { data: scheduleRow, error: scheduleError } = await supabase
    .from("program_schedule")
    .select("lesson_id")
    .eq("program_version", PROGRAM_VERSION)
    .eq("day_number", day)
    .maybeSingle();

  if (scheduleError) {
    return errorResponse(500, "INTERNAL_ERROR", "Failed to load program schedule", requestId);
  }

  if (!scheduleRow?.lesson_id) {
    const repeatLesson =
      completedToday && completedDay >= 1
        ? await lookupRepeatLesson(supabase, completedDay)
        : null;
    return nextLessonResponse(null, repeatLesson, requestId);
  }

  const { data: lesson, error: lessonError } = await supabase
    .from("lessons")
    .select(DETAIL_COLUMNS)
    .eq("id", scheduleRow.lesson_id)
    .eq("published", true)
    .single();

  if (lessonError || !lesson) {
    return errorResponse(404, "NOT_FOUND", "Scheduled lesson not found or unpublished", requestId);
  }

  const { data: categories } = await supabase
    .from("lesson_categories")
    .select("category")
    .eq("lesson_id", lesson.id);

  const enriched = await resolveContentBlockUrls(supabase, lesson as Record<string, unknown>);

  const lessonData = {
    ...enriched,
    program_day: day,
    program_version: PROGRAM_VERSION,
    categories: (categories ?? []).map((c: { category: string }) => c.category),
  };

  const repeatLesson =
    completedToday && completedDay >= 1
      ? await lookupRepeatLesson(supabase, completedDay)
      : null;

  return nextLessonResponse(lessonData, repeatLesson, requestId);
}

// ---------------------------------------------------------------------------
// P1 — record lesson completion + MAC scoring (decay then gain)
// ---------------------------------------------------------------------------
async function handleComplete(
  req: Request,
  supabase: ReturnType<typeof createServiceClient>,
  lessonId: string,
  userId: string,
  requestId: string,
): Promise<Response> {
  const parsed = UuidSchema.safeParse(lessonId);
  if (!parsed.success) {
    return errorResponse(400, "VALIDATION_ERROR", "Invalid lesson ID format", requestId);
  }

  const idempotencyKey = req.headers.get("Idempotency-Key");
  if (!idempotencyKey) {
    return errorResponse(400, "VALIDATION_ERROR", "Idempotency-Key header is required", requestId);
  }

  const check = await checkIdempotencyKey(supabase, idempotencyKey, userId, requestId);
  if (check.replay) return check.response;

  const { data: lessonRow, error: lessonErr } = await supabase
    .from("lessons")
    .select("id, title")
    .eq("id", parsed.data)
    .eq("published", true)
    .single();

  if (lessonErr || !lessonRow) {
    return errorResponse(404, "NOT_FOUND", "Lesson not found", requestId);
  }

  const { data: cats } = await supabase
    .from("lesson_categories")
    .select("category")
    .eq("lesson_id", parsed.data);
  const lessonCategories = (cats ?? []).map((c: { category: string }) => c.category);

  const localYmd = resolveLocalTodayYmd(req);

  // Read decay inputs BEFORE the RPC so last_wod_completion_local_date
  // reflects the prior WOD, not the one we are about to record.
  const { data: preProfile } = await supabase
    .from("profiles")
    .select("last_wod_completion_local_date")
    .eq("id", userId)
    .single();

  const { data: rpcResult, error: rpcErr } = await supabase.rpc("complete_lesson", {
    p_user_id: userId,
    p_lesson_id: parsed.data,
    p_completion_local_date: localYmd,
  });

  if (rpcErr) {
    return errorResponse(500, "INTERNAL_ERROR", "Failed to record completion", requestId);
  }

  // --- MAC scoring: apply pending decay then gain ---
  const { data: progressRow } = await supabase
    .from("user_progress")
    .select("mindfulness_score, acceptance_score, commitment_score, last_decay_applied_local_date")
    .eq("user_id", userId)
    .maybeSingle();

  let scores: MacScores = {
    mindfulness_score: progressRow?.mindfulness_score ?? 0,
    acceptance_score: progressRow?.acceptance_score ?? 0,
    commitment_score: progressRow?.commitment_score ?? 0,
  };

  const lastDecay = (progressRow?.last_decay_applied_local_date as string | null) ?? null;
  const lastWod = (preProfile?.last_wod_completion_local_date as string | null) ?? null;
  let allDeltas: MacDeltas = {};

  const gap = decayGapDays(lastDecay, localYmd);
  if (gap > 0) {
    const missed = missedWodDaysInGap(lastWod, lastDecay, localYmd);
    const decay = applyDecay(scores, gap, missed);
    scores = decay.scores;
    allDeltas = decay.deltas;
  }

  const gain = computeGain(rpcResult.lesson_completion_count as number);
  const gainResult = applyGain(
    scores,
    gain,
    lessonCategories,
    lessonRow.title as string,
    rpcResult.lesson_completion_count as number,
  );
  scores = gainResult.scores;

  for (const [cat, d] of Object.entries(gainResult.deltas)) {
    const existing = (allDeltas as Record<string, { amount: number; reason: string }>)[cat];
    if (existing) {
      (allDeltas as Record<string, { amount: number; reason: string }>)[cat] = {
        amount: existing.amount + d.amount,
        reason: `${existing.reason}; ${d.reason}`,
      };
    } else {
      (allDeltas as Record<string, { amount: number; reason: string }>)[cat] = d;
    }
  }

  const yest = yesterdayYmd(localYmd);
  await supabase.from("user_progress").upsert(
    {
      user_id: userId,
      mindfulness_score: scores.mindfulness_score,
      acceptance_score: scores.acceptance_score,
      commitment_score: scores.commitment_score,
      last_decay_applied_local_date: gap > 0 ? yest : (lastDecay ?? localYmd),
    },
    { onConflict: "user_id" },
  );

  const responseBody = {
    data: {
      lesson_id: parsed.data,
      completed_at: rpcResult.completed_at,
      progress: { ...scores, deltas: allDeltas },
      streak: rpcResult.streak,
    },
    request_id: requestId,
  };

  await storeIdempotencyKey(supabase, idempotencyKey, userId, 200, responseBody);

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
