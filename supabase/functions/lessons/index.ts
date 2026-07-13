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
  claimIdempotencyKey,
  storeIdempotencyResult,
} from "../_shared/idempotency.ts";
import { checkRateLimit } from "../_shared/ratelimit.ts";
import { computeLibraryUnlocked, calendarDaysInclusiveYmd } from "../_shared/library.ts";
import { parseProgramAnchor, resolveLocalTodayYmd } from "../_shared/client_day.ts";
import { ensureProgramStartIfHome } from "../_shared/program_start.ts";
import { ContentBlocksSchema } from "../_shared/content_blocks.ts";

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
  "id, coach_id, title, duration_seconds, lesson_type, sort_order, program_id, sequence";
const DETAIL_COLUMNS =
  "id, coach_id, title, duration_seconds, lesson_type, voiceover_url, on_screen_text, reflection_prompt, content_blocks, sort_order, production_ready, description, program_id, sequence";

const PROGRAM_VERSION = "v1";
// The original live program. When it is the user's active program we resolve the
// daily WOD via program_schedule (v1) exactly as before; any other active pack
// resolves via lessons.(program_id, sequence).
const SPRINT_PROGRAM_ID = "b0000000-0000-0000-0000-000000000001";
const AUDIO_BUCKET = "lesson-audio";
const SIGNED_URL_TTL = 3600; // 1 hour

// Returns signed URLs for the given storage paths, serving from audio_url_cache
// when possible so the Smart CDN sees stable URLs and can cache at the edge.
// Never throws — on any cache failure it falls back to plain createSignedUrl.
async function getSignedUrls(
  supabase: ReturnType<typeof createServiceClient>,
  paths: string[],
): Promise<Map<string, string>> {
  const urlMap = new Map<string, string>();
  const uniquePaths = [...new Set(paths)];
  if (uniquePaths.length === 0) return urlMap;

  // Cache read: only accept entries that stay valid for at least 5 more
  // minutes so the client never receives a URL about to expire.
  try {
    const cutoff = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("audio_url_cache")
      .select("path, signed_url")
      .in("path", uniquePaths)
      .gt("expires_at", cutoff);
    if (error) {
      console.error("[audio_url_cache] read failed:", error);
    } else {
      for (const row of (data ?? []) as Array<{ path: string; signed_url: string }>) {
        urlMap.set(row.path, row.signed_url);
      }
    }
  } catch (e) {
    console.error("[audio_url_cache] read threw:", e);
  }

  const misses = uniquePaths.filter((p) => !urlMap.has(p));
  if (misses.length === 0) return urlMap;

  const results = await Promise.all(
    misses.map((p) =>
      supabase.storage.from(AUDIO_BUCKET).createSignedUrl(p, SIGNED_URL_TTL),
    ),
  );

  const rows: Array<{ path: string; signed_url: string; expires_at: string }> = [];
  const expiresAt = new Date(Date.now() + SIGNED_URL_TTL * 1000).toISOString();
  for (let i = 0; i < misses.length; i++) {
    const signedUrl = results[i].data?.signedUrl;
    if (signedUrl) {
      urlMap.set(misses[i], signedUrl);
      rows.push({ path: misses[i], signed_url: signedUrl, expires_at: expiresAt });
    }
  }

  if (rows.length > 0) {
    try {
      const { error } = await supabase
        .from("audio_url_cache")
        .upsert(rows, { onConflict: "path" });
      if (error) console.error("[audio_url_cache] upsert failed:", error);
    } catch (e) {
      console.error("[audio_url_cache] upsert threw:", e);
    }
  }

  return urlMap;
}

// ---------------------------------------------------------------------------
// Resolve storage paths inside content_blocks to signed URLs.
// Validates the JSONB shape via Zod first; strips blocks on failure so the
// client falls back to legacy flat columns instead of crashing.
// ---------------------------------------------------------------------------
async function resolveContentBlockUrls(
  supabase: ReturnType<typeof createServiceClient>,
  lesson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!lesson.content_blocks) return lesson;

  const parsed = ContentBlocksSchema.safeParse(lesson.content_blocks);
  if (!parsed.success) {
    console.error(
      `[content_blocks] validation failed for lesson ${lesson.id}:`,
      parsed.error.issues,
    );
    return { ...lesson, content_blocks: null };
  }

  const cb = parsed.data;

  const pathsToSign: string[] = [];
  for (const block of cb.blocks) {
    if (block.type === "voiceover") {
      for (const p of block.audio_files) pathsToSign.push(p);
    } else if (block.type === "timed_exercise" && block.ambient_audio) {
      pathsToSign.push(block.ambient_audio);
    } else if (block.type === "flash_cards" && block.ambient_audio) {
      pathsToSign.push(block.ambient_audio);
    } else if (block.type === "tap_through_text" && block.ambient_audio) {
      pathsToSign.push(block.ambient_audio);
    }
  }

  if (pathsToSign.length === 0) return lesson;

  const urlMap = await getSignedUrls(supabase, pathsToSign);

  const resolved = structuredClone(cb);
  for (const block of resolved.blocks) {
    if (block.type === "voiceover") {
      block.audio_files = block.audio_files.map((p) => urlMap.get(p) ?? p);
    } else if (block.type === "timed_exercise" && block.ambient_audio) {
      block.ambient_audio = urlMap.get(block.ambient_audio) ?? block.ambient_audio;
    } else if (block.type === "flash_cards" && block.ambient_audio) {
      block.ambient_audio = urlMap.get(block.ambient_audio) ?? block.ambient_audio;
    } else if (block.type === "tap_through_text" && block.ambient_audio) {
      block.ambient_audio = urlMap.get(block.ambient_audio) ?? block.ambient_audio;
    }
  }

  return { ...lesson, content_blocks: resolved };
}

// ---------------------------------------------------------------------------
// Additive enrichment for the WOD card / lesson start screen: the lesson's
// coach (with a signed avatar URL) and its program title + length. Never
// throws — on any failure the fields come back null and the lesson payload
// is unaffected. Older app builds simply ignore these extra fields.
// ---------------------------------------------------------------------------
type CoachInfo = {
  coach_key: string | null;
  name: string;
  credentials: string | null;
  bio: string | null;
  long_bio: string | null;
  avatar_url: string | null;
  offer_label: string | null;
  external_url: string | null;
};

async function loadCoachAndProgram(
  supabase: ReturnType<typeof createServiceClient>,
  lesson: Record<string, unknown>,
): Promise<{
  coach: CoachInfo | null;
  program_title: string | null;
  program_key: string | null;
  program_total_days: number | null;
}> {
  let coach: CoachInfo | null = null;
  let programTitle: string | null = null;
  let programKey: string | null = null;
  let programTotalDays: number | null = null;

  const coachId = (lesson.coach_id as string | null) ?? null;
  if (coachId) {
    const { data: c } = await supabase
      .from("coaches")
      .select(
        "coach_key, name, credentials, bio, long_bio, avatar_url, offer_label, external_url",
      )
      .eq("id", coachId)
      .maybeSingle();
    if (c) {
      // avatar_url stores a storage path (loader uploads into the same bucket
      // as lesson audio); sign it. Absolute URLs pass through untouched.
      let avatarUrl = (c.avatar_url as string | null) ?? null;
      if (avatarUrl && !/^https?:\/\//i.test(avatarUrl)) {
        const signedMap = await getSignedUrls(supabase, [avatarUrl]);
        avatarUrl = signedMap.get(avatarUrl) ?? null;
      }
      coach = {
        coach_key: (c.coach_key as string | null) ?? null,
        name: c.name as string,
        credentials: (c.credentials as string | null) ?? null,
        bio: (c.bio as string | null) ?? null,
        long_bio: (c.long_bio as string | null) ?? null,
        avatar_url: avatarUrl,
        offer_label: (c.offer_label as string | null) ?? null,
        external_url: (c.external_url as string | null) ?? null,
      };
    }
  }

  const programId = (lesson.program_id as string | null) ?? null;
  if (programId) {
    const { data: p } = await supabase
      .from("programs")
      .select("title, program_key")
      .eq("id", programId)
      .maybeSingle();
    if (p?.title) programTitle = p.title as string;
    programKey = (p?.program_key as string | null) ?? null;

    const { count } = await supabase
      .from("lessons")
      .select("id", { count: "exact", head: true })
      .eq("program_id", programId);
    if (typeof count === "number" && count > 0) programTotalDays = count;
  }

  return {
    coach,
    program_title: programTitle,
    program_key: programKey,
    program_total_days: programTotalDays,
  };
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
// C1 — list published lessons (library always accessible)
// ---------------------------------------------------------------------------
async function handleList(
  url: URL,
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  requestId: string,
  localTodayYmd: string,
): Promise<Response> {
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

  // Profile drives both the past-WOD gating below and the preview gate: lessons
  // flagged production_ready = false are catalog-visible ONLY to is_dev accounts.
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("current_program_day, is_dev, active_program_id")
    .eq("id", userId)
    .maybeSingle();
  const isDev = profileRow?.is_dev === true;
  const currentProgramDay = typeof profileRow?.current_program_day === "number"
    ? profileRow.current_program_day
    : 1;
  const activeProgramId = (profileRow?.active_program_id as string | null) ?? SPRINT_PROGRAM_ID;

  // Schedule-gated (Sprint) past-WOD eligibility must stay stable across pack
  // switches: profiles.current_program_day is repointed to whichever pack is
  // ACTIVE, so once the user switches away it no longer reflects the Sprint's
  // day at all. Use the Sprint-specific day from user_program_state instead —
  // it is kept in sync with the profile pointer whenever Sprint is active (see
  // complete_lesson / POST /programs/select), so this changes nothing for
  // users who never switch packs. Falls back to the profile pointer only while
  // Sprint IS still the active pack (no state row yet == unchanged legacy
  // behavior); otherwise defaults to day 1 (nothing was ever unlocked by day
  // advancement for a pack the user made no progress on before switching).
  const { data: sprintStateRow } = await supabase
    .from("user_program_state")
    .select("current_day")
    .eq("user_id", userId)
    .eq("program_id", SPRINT_PROGRAM_ID)
    .maybeSingle();
  const sprintProgramDay = typeof sprintStateRow?.current_day === "number"
    ? sprintStateRow.current_day
    : activeProgramId === SPRINT_PROGRAM_ID
      ? currentProgramDay
      : 1;

  let lessonsQuery = supabase
    .from("lessons")
    .select(METADATA_COLUMNS, { count: "exact" })
    .eq("published", true);
  if (!isDev) lessonsQuery = lessonsQuery.eq("production_ready", true);
  const { data: lessons, error, count } = await lessonsQuery
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

  // Completions used only for day 30 in Past WODs (current_program_day caps at 30).
  // Days 1–29 there use program_day < current_program_day only.
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

  // Build lesson_id → earliest day_number map for schedule entries.
  const dayNumberById = new Map<string, number>();
  const scheduledIds = new Set<string>();
  for (const row of schedule ?? []) {
    const lid = row.lesson_id as string;
    scheduledIds.add(lid);
    const existing = dayNumberById.get(lid);
    if (existing === undefined || (row.day_number as number) < existing) {
      dayNumberById.set(lid, row.day_number as number);
    }
  }

  const items = (lessons ?? []).map((l: Record<string, unknown>) => {
    const lid = l.id as string;

    // Prefer the program_schedule day; fall back to lesson.sequence for packs
    // loaded via the new loader (they have program_id + sequence but no schedule row).
    const schedDay = scheduledIds.has(lid) ? (dayNumberById.get(lid) ?? null) : null;
    const seqDay: number | null =
      schedDay === null &&
      (l.program_id as string | null) != null &&
      (l.sequence as number | null) != null
        ? (l.sequence as number)
        : null;

    return {
      ...l,
      // Restate id explicitly: spreading Record<string, unknown> loses named
      // keys in Deno's stricter TS, breaking `l.id` reads on the mapped items.
      id: lid,
      categories: categoryMap.get(lid) ?? [],
      program_day: schedDay ?? seqDay,
    };
  });

  // v1 schedule gating: lesson is past-eligible once the program day has advanced.
  // Non-schedule pack lessons: eligible only after the user has completed them.
  const pastWodLibraryEligible = (
    lessonId: string,
    programDay: number,
    inSchedule: boolean,
  ): boolean => {
    if (inSchedule) {
      if (programDay < sprintProgramDay) return true;
      if (programDay === 30 && sprintProgramDay === 30) {
        return completedSet.has(lessonId);
      }
      return false;
    }
    return completedSet.has(lessonId);
  };

  // Regular lessons first (sort_order preserved), then eligible past WODs only.
  const regular = items.filter((l) => l.program_day === null);
  const wods = items
    .filter((l) => {
      const d = l.program_day as number | null;
      if (d === null) return false;
      return pastWodLibraryEligible(l.id as string, d, scheduledIds.has(l.id as string));
    })
    .sort((a, b) => (a.program_day as number) - (b.program_day as number));

  // Attach program_title, coach_name, and coach_avatar_url to WOD items so the
  // client can render per-program bubbles without a second round-trip.
  const programIdSet = new Set<string>();
  for (const w of wods) {
    const pid = (w as { program_id?: string | null }).program_id;
    if (pid) programIdSet.add(pid);
  }

  type CoachMeta = { name: string; avatar_url: string | null };
  const programMeta = new Map<string, { title: string; coach_name: string; coach_avatar_url: string | null }>();

  if (programIdSet.size > 0) {
    const pids = [...programIdSet];
    const { data: progRows } = await supabase
      .from("programs")
      .select("id, title, coach_id")
      .in("id", pids);

    const coachIdSet = new Set<string>();
    for (const p of progRows ?? []) coachIdSet.add(p.coach_id as string);

    const { data: coachRows } = coachIdSet.size > 0
      ? await supabase
          .from("coaches")
          .select("id, name, avatar_url")
          .in("id", [...coachIdSet])
      : { data: [] };

    // Sign avatar storage paths; absolute URLs pass through untouched.
    const coachById = new Map<string, CoachMeta>();
    await Promise.all(
      (coachRows ?? []).map(async (c) => {
        let avatarUrl = (c.avatar_url as string | null) ?? null;
        if (avatarUrl && !/^https?:\/\//i.test(avatarUrl)) {
          const { data: signed } = await supabase.storage
            .from(AUDIO_BUCKET)
            .createSignedUrl(avatarUrl, SIGNED_URL_TTL);
          avatarUrl = signed?.signedUrl ?? null;
        }
        coachById.set(c.id as string, { name: c.name as string, avatar_url: avatarUrl });
      }),
    );

    for (const p of progRows ?? []) {
      const coach = coachById.get(p.coach_id as string);
      programMeta.set(p.id as string, {
        title: p.title as string,
        coach_name: coach?.name ?? "",
        coach_avatar_url: coach?.avatar_url ?? null,
      });
    }
  }

  const wodsWithMeta = wods.map((w) => {
    const pid = (w as { program_id?: string | null }).program_id ?? null;
    const meta = pid ? programMeta.get(pid) : undefined;
    return {
      ...w,
      program_title: meta?.title ?? null,
      coach_name: meta?.coach_name ?? null,
      coach_avatar_url: meta?.coach_avatar_url ?? null,
    };
  });

  const sorted = [...regular, ...wodsWithMeta];

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

  const { data: lesson, error } = await supabase
    .from("lessons")
    .select(DETAIL_COLUMNS)
    .eq("id", parsed.data)
    .eq("published", true)
    .single();

  if (error || !lesson) {
    return errorResponse(404, "NOT_FOUND", "Lesson not found", requestId);
  }

  // Preview gate: not-production-ready lessons load ONLY for is_dev accounts.
  // Everyone else gets the same 404 as a non-existent lesson.
  if ((lesson as { production_ready?: boolean }).production_ready === false) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("is_dev")
      .eq("id", userId)
      .maybeSingle();
    if (prof?.is_dev !== true) {
      return errorResponse(404, "NOT_FOUND", "Lesson not found", requestId);
    }
  }

  const { data: categories } = await supabase
    .from("lesson_categories")
    .select("category")
    .eq("lesson_id", parsed.data);

  const enriched = await resolveContentBlockUrls(supabase, lesson as Record<string, unknown>);
  const extras = await loadCoachAndProgram(supabase, lesson as Record<string, unknown>);
  const sequence = (lesson as { sequence?: number | null }).sequence;

  return successResponse(
    {
      ...enriched,
      categories: (categories ?? []).map((c: { category: string }) => c.category),
      coach: extras.coach,
      program_title: extras.program_title,
      program_key: extras.program_key,
      program_total_days: extras.program_total_days,
      // Program day for the start-screen header; sequence == day for programs.
      program_day: typeof sequence === "number" ? sequence : null,
    },
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
// helpers: active-program day resolution + repeat-lesson lookup + /next envelope
// ---------------------------------------------------------------------------

// Resolve the lesson id for a given day of the user's active program, plus the
// program's total day count. Sprint -> program_schedule (v1, live path). Any
// other pack -> lessons.(program_id, sequence), published only.
async function resolveProgramDayLessonId(
  supabase: ReturnType<typeof createServiceClient>,
  activeProgramId: string,
  day: number,
): Promise<{ lessonId: string | null; totalDays: number }> {
  if (activeProgramId === SPRINT_PROGRAM_ID) {
    const { data: row } = await supabase
      .from("program_schedule")
      .select("lesson_id")
      .eq("program_version", PROGRAM_VERSION)
      .eq("day_number", day)
      .maybeSingle();
    const { count } = await supabase
      .from("program_schedule")
      .select("day_number", { count: "exact", head: true })
      .eq("program_version", PROGRAM_VERSION);
    return { lessonId: (row?.lesson_id as string | null) ?? null, totalDays: count ?? 0 };
  }

  const { data: row } = await supabase
    .from("lessons")
    .select("id")
    .eq("program_id", activeProgramId)
    .eq("sequence", day)
    .eq("published", true)
    .maybeSingle();
  const { data: maxRow } = await supabase
    .from("lessons")
    .select("sequence")
    .eq("program_id", activeProgramId)
    .eq("published", true)
    .order("sequence", { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    lessonId: (row?.id as string | null) ?? null,
    totalDays: (maxRow?.sequence as number | null) ?? 0,
  };
}

async function lookupRepeatLesson(
  supabase: ReturnType<typeof createServiceClient>,
  completedDay: number,
  activeProgramId: string,
): Promise<Record<string, unknown> | null> {
  if (completedDay < 1) return null;

  const { lessonId } = await resolveProgramDayLessonId(supabase, activeProgramId, completedDay);
  if (!lessonId) return null;

  const { data: lesson, error } = await supabase
    .from("lessons")
    .select(METADATA_COLUMNS)
    .eq("id", lessonId)
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
    program_version: activeProgramId === SPRINT_PROGRAM_ID ? PROGRAM_VERSION : null,
    categories: (cats ?? []).map((c: { category: string }) => c.category),
  };
}

function nextLessonResponse(
  data: unknown,
  repeatLesson: Record<string, unknown> | null,
  requestId: string,
  programComplete = false,
): Response {
  const body: Record<string, unknown> = { data, request_id: requestId };
  if (repeatLesson) body.repeat_lesson = repeatLesson;
  if (programComplete) body.program_complete = true;
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
    .select("current_program_day, program_start_date, last_wod_completion_local_date, is_dev, active_program_id")
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    return errorResponse(500, "INTERNAL_ERROR", "Failed to load program state", requestId);
  }

  const day = profile.current_program_day as number;
  const activeProgramId = (profile.active_program_id as string | null) ?? SPRINT_PROGRAM_ID;
  const isSprint = activeProgramId === SPRINT_PROGRAM_ID;
  const completedToday =
    (profile.last_wod_completion_local_date as string | null) === localTodayYmd;
  const completedDay = day - 1;
  const isDevAccount = profile.is_dev === true;

  if (!isDevAccount && profile.program_start_date) {
    const elapsed = calendarDaysInclusiveYmd(
      profile.program_start_date as string,
      localTodayYmd,
    );
    if (day > elapsed) {
      const repeatLesson =
        completedToday && completedDay >= 1
          ? await lookupRepeatLesson(supabase, completedDay, activeProgramId)
          : null;
      return nextLessonResponse(null, repeatLesson, requestId);
    }
  }

  const { lessonId: currentLessonId, totalDays } = await resolveProgramDayLessonId(
    supabase,
    activeProgramId,
    day,
  );

  if (!currentLessonId) {
    const repeatLesson =
      completedToday && completedDay >= 1
        ? await lookupRepeatLesson(supabase, completedDay, activeProgramId)
        : null;
    return nextLessonResponse(null, repeatLesson, requestId);
  }

  const { data: lesson, error: lessonError } = await supabase
    .from("lessons")
    .select(DETAIL_COLUMNS)
    .eq("id", currentLessonId)
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
  const extras = await loadCoachAndProgram(supabase, lesson as Record<string, unknown>);

  const lessonData = {
    ...enriched,
    program_day: day,
    program_version: isSprint ? PROGRAM_VERSION : null,
    categories: (categories ?? []).map((c: { category: string }) => c.category),
    coach: extras.coach,
    program_title: extras.program_title,
    program_key: extras.program_key,
    program_total_days: extras.program_total_days ?? (totalDays > 0 ? totalDays : null),
  };

  const repeatLesson =
    completedToday && completedDay >= 1
      ? await lookupRepeatLesson(supabase, completedDay, activeProgramId)
      : null;

  // Program completion: current_program_day caps at the program length (see
  // complete_lesson), so once the final day's lesson is completed the user has
  // finished the pack. The "complete" screen is intentionally shown the DAY
  // AFTER the final lesson is finished, so we compare the earliest final-day
  // completion date against the user's local today. Basing this on that
  // completion row (rather than last_wod_completion_local_date) keeps it stable
  // even if the user later does Library lessons.
  let programComplete = false;
  if (totalDays > 0 && day >= totalDays) {
    const { data: finalCompletion } = await supabase
      .from("user_lesson_completions")
      .select("completion_local_date")
      .eq("user_id", userId)
      .eq("lesson_id", currentLessonId)
      .order("completion_local_date", { ascending: true })
      .limit(1)
      .maybeSingle();
    const completedOn = finalCompletion?.completion_local_date as string | undefined;
    programComplete = typeof completedOn === "string" && completedOn < localTodayYmd;
  }

  return nextLessonResponse(lessonData, repeatLesson, requestId, programComplete);
}

// ---------------------------------------------------------------------------
// P1 — record lesson completion atomically (RPC handles MAC scoring + streak
// + program_day in one transaction under a per-user advisory lock).
// ---------------------------------------------------------------------------
type CompleteLessonRpcResult = {
  completed_at: string;
  is_duplicate: boolean;
  lesson_completion_count: number;
  lesson_title: string | null;
  scores: {
    mindfulness_score: number;
    acceptance_score: number;
    commitment_score: number;
  };
  decay: { gap_days: number; amount: number } | null;
  gains: Array<{ category: string; daily_count: number; amount: number }>;
  streak: {
    current_streak: number;
    longest_streak: number;
    last_activity_date: string | null;
  };
};

function fmt1(n: number): string {
  return n.toFixed(1);
}

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

  // Claim-first idempotency: reserves the key atomically with a placeholder
  // row, so two concurrent same-key requests never both run side effects.
  const claim = await claimIdempotencyKey(supabase, idempotencyKey, userId, requestId);
  if (!claim.claimed) return claim.response;

  const { data: lessonRow, error: lessonErr } = await supabase
    .from("lessons")
    .select("id, program_id, sequence, production_ready")
    .eq("id", parsed.data)
    .eq("published", true)
    .single();

  if (lessonErr || !lessonRow) {
    return errorResponse(404, "NOT_FOUND", "Lesson not found", requestId);
  }

  // Preview gate — mirrors handleDetail: non-production-ready lessons can only
  // be completed by is_dev accounts. Everyone else gets the same 404 as a
  // non-existent lesson, so preview content can't affect scores/streaks.
  if ((lessonRow as { production_ready?: boolean }).production_ready === false) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("is_dev")
      .eq("id", userId)
      .maybeSingle();
    if (prof?.is_dev !== true) {
      return errorResponse(404, "NOT_FOUND", "Lesson not found", requestId);
    }
  }

  const localYmd = resolveLocalTodayYmd(req);

  const { data: rpcRaw, error: rpcErr } = await supabase.rpc("complete_lesson", {
    p_user_id: userId,
    p_lesson_id: parsed.data,
    p_completion_local_date: localYmd,
  });

  if (rpcErr || !rpcRaw) {
    return errorResponse(500, "INTERNAL_ERROR", "Failed to record completion", requestId);
  }

  const rpc = rpcRaw as CompleteLessonRpcResult;

  // Reason strings are built in TS so PRD's "tunables centralised in scoring.ts"
  // text formatting stays here. Amounts come from SQL (single source of truth
  // for atomicity).
  const deltas: Record<string, { amount: number; reason: string }> = {};

  if (rpc.decay) {
    const amount = Number(rpc.decay.amount);
    const reason = `${rpc.decay.gap_days}d inactive (\u2212${fmt1(amount)})`;
    for (const cat of ["mindfulness", "acceptance", "commitment"] as const) {
      deltas[cat] = { amount: -amount, reason };
    }
  }

  for (const g of rpc.gains ?? []) {
    const gainAmount = Number(g.amount);
    const reason = g.daily_count > 1
      ? `${g.category} session #${g.daily_count} today (+${fmt1(gainAmount)})`
      : `Completed "${rpc.lesson_title ?? ""}" (+${fmt1(gainAmount)})`;
    const existing = deltas[g.category];
    deltas[g.category] = existing
      ? { amount: existing.amount + gainAmount, reason: `${existing.reason}; ${reason}` }
      : { amount: gainAmount, reason };
  }

  // Pack completion (additive; older clients ignore these fields): true only
  // the FIRST time the user completes the final lesson of their ACTIVE program.
  // Same-day repeats (is_duplicate) and later Library replays (completion_count
  // > 1) never re-trigger it. Never throws — on any lookup failure it stays
  // false and the completion response is unaffected.
  let packCompleted = false;
  let packTitle: string | null = null;
  try {
    const lessonProgramId = (lessonRow as { program_id?: string | null }).program_id ?? null;
    const lessonSequence = (lessonRow as { sequence?: number | null }).sequence ?? null;
    if (
      !rpc.is_duplicate &&
      rpc.lesson_completion_count === 1 &&
      lessonProgramId &&
      typeof lessonSequence === "number"
    ) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("active_program_id")
        .eq("id", userId)
        .maybeSingle();
      const activeId = (prof?.active_program_id as string | null) ?? SPRINT_PROGRAM_ID;
      if (activeId === lessonProgramId) {
        const { data: maxRow } = await supabase
          .from("lessons")
          .select("sequence")
          .eq("program_id", lessonProgramId)
          .eq("published", true)
          .order("sequence", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (typeof maxRow?.sequence === "number" && maxRow.sequence === lessonSequence) {
          packCompleted = true;
          const { data: prog } = await supabase
            .from("programs")
            .select("title")
            .eq("id", lessonProgramId)
            .maybeSingle();
          packTitle = (prog?.title as string | null) ?? null;
        }
      }
    }
  } catch (e) {
    console.error("[complete] pack completion check failed:", e);
  }

  const responseBody = {
    data: {
      lesson_id: parsed.data,
      completed_at: rpc.completed_at,
      progress: {
        mindfulness_score: Number(rpc.scores.mindfulness_score),
        acceptance_score: Number(rpc.scores.acceptance_score),
        commitment_score: Number(rpc.scores.commitment_score),
        deltas,
      },
      streak: rpc.streak,
      pack_completed: packCompleted,
      pack_title: packTitle,
    },
    request_id: requestId,
  };

  await storeIdempotencyResult(supabase, idempotencyKey, userId, 200, responseBody);

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
