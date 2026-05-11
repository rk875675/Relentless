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
import { parseProgramAnchor, resolveLocalTodayYmd } from "../_shared/client_day.ts";
import { ensureProgramStartIfHome } from "../_shared/program_start.ts";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

const JournalEntryTypeEnum = z.enum(["session", "miss_reflection", "onboarding_future_self"]);

const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
});

const ListQuerySchema = PaginationSchema.extend({
  entry_type: JournalEntryTypeEnum.optional(),
});

const UuidSchema = z.string().uuid();

/** Matches `program_schedule.program_version` / lessons edge (v1 program). */
const PROGRAM_VERSION = "v1";

const ProgramDayQuerySchema = z.object({
  program_day: z.coerce.number().int().min(1).max(30),
});

const CreateSchema = z
  .object({
    body: z.string().min(1),
    lesson_id: z.string().uuid().optional(),
    competition_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    entry_type: JournalEntryTypeEnum.default("session"),
  })
  .strict();

const UpdateSchema = z
  .object({
    body: z.string().min(1),
  })
  .strict();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = generateRequestId();

  if (!["GET", "POST", "PATCH", "DELETE"].includes(req.method)) {
    return errorResponse(405, "VALIDATION_ERROR", "Method not allowed", requestId);
  }

  const supabase = createServiceClient();
  const auth = await getUser(req, supabase, requestId);
  if (!auth.ok) return auth.response;

  const rl = await checkRateLimit(
    auth.userId, requestId,
    req.method === "GET" ? "authenticated-read" : "authenticated-write",
  );
  if (!rl.ok) return rl.response;

  let skipEntitlement = false;
  if (req.method === "POST") {
    try {
      const peek = await req.clone().json();
      if (peek?.entry_type === "onboarding_future_self") skipEntitlement = true;
    } catch { /* proceed with entitlement check */ }
  }

  if (!skipEntitlement) {
    const entitlement = await requireEntitlement(supabase, auth.userId, requestId);
    if (!entitlement.ok) return entitlement.response;
  }

  const url = new URL(req.url);
  const pathMatch = url.pathname.match(/\/journal(?:\/(.+))?$/);
  const subPath = (pathMatch?.[1] ?? "").replace(/\/$/, "");

  if (req.method === "GET" && subPath === "") {
    return handleList(url, supabase, auth.userId, requestId);
  }
  if (req.method === "GET" && subPath === "by-program-day") {
    return handleByProgramDay(url, supabase, auth.userId, requestId);
  }
  if (req.method === "GET" && subPath === "session-log") {
    return handleSessionLog(supabase, auth.userId, requestId);
  }
  if (req.method === "GET" && subPath !== "") {
    return handleGetById(supabase, subPath, auth.userId, requestId);
  }
  if (req.method === "POST" && subPath === "") {
    return handleCreate(req, supabase, auth.userId, requestId);
  }
  if (req.method === "PATCH" && subPath !== "") {
    return handleUpdate(req, supabase, subPath, auth.userId, requestId);
  }
  if (req.method === "DELETE" && subPath !== "") {
    return handleDelete(supabase, subPath, auth.userId, requestId);
  }

  return errorResponse(405, "VALIDATION_ERROR", "Method not allowed for this path", requestId);
});

type LessonJoin = {
  title?: string;
  lesson_categories?: { category: string } | { category: string }[] | null;
} | null;

function lessonJoinToTitleAndCategories(lesson: LessonJoin): {
  lesson_title: string | null;
  categories: string[];
} {
  if (!lesson) return { lesson_title: null, categories: [] };
  const raw = lesson.lesson_categories;
  const rows = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
  const categories = rows.map((r) => r.category).filter(Boolean);
  return { lesson_title: lesson.title ?? null, categories };
}

// Fetch latest session journal tied to the canonical WOD lesson for a program day (1–30).
async function handleByProgramDay(
  url: URL,
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  requestId: string,
): Promise<Response> {
  const parsed = ProgramDayQuerySchema.safeParse({
    program_day: url.searchParams.get("program_day") ?? undefined,
  });
  if (!parsed.success) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Invalid program_day",
      requestId,
    );
  }
  const programDay = parsed.data.program_day;

  const { data: sched, error: schedErr } = await supabase
    .from("program_schedule")
    .select("lesson_id")
    .eq("program_version", PROGRAM_VERSION)
    .eq("day_number", programDay)
    .maybeSingle();

  if (schedErr) {
    return errorResponse(500, "INTERNAL_ERROR", "Failed to resolve program day", requestId);
  }
  const lessonId = sched?.lesson_id as string | undefined;
  if (!lessonId) {
    return successResponse({ entry: null, program_day: programDay }, requestId);
  }

  const { data: row, error } = await supabase
    .from("journal_entries")
    .select(
      "id, lesson_id, competition_date, body, entry_type, created_at, updated_at, lessons(title, lesson_categories(category))",
    )
    .eq("user_id", userId)
    .eq("lesson_id", lessonId)
    .eq("entry_type", "session")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return errorResponse(500, "INTERNAL_ERROR", "Failed to fetch journal entry", requestId);
  }
  if (!row) {
    return successResponse({ entry: null, program_day: programDay }, requestId);
  }

  const { lessons, ...e } = row as typeof row & { lessons: LessonJoin };
  const { lesson_title, categories } = lessonJoinToTitleAndCategories(lessons);

  return successResponse(
    { entry: { ...e, lesson_title, categories }, program_day: programDay },
    requestId,
  );
}

/** Session-type entries oldest-first (for Day 30 evidence log review). */
async function handleSessionLog(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  requestId: string,
): Promise<Response> {
  const MAX = 200;
  const { data: rows, error } = await supabase
    .from("journal_entries")
    .select(
      "id, lesson_id, competition_date, body, entry_type, created_at, updated_at, lessons(title, lesson_categories(category))",
    )
    .eq("user_id", userId)
    .eq("entry_type", "session")
    .order("created_at", { ascending: true })
    .limit(MAX);

  if (error) {
    return errorResponse(500, "INTERNAL_ERROR", "Failed to fetch journal entries", requestId);
  }

  const items = (rows ?? []).map(({ lessons, ...e }) => {
    const { lesson_title, categories } = lessonJoinToTitleAndCategories(lessons as LessonJoin);
    return { ...e, lesson_title, categories };
  });

  return successResponse({ items }, requestId);
}

// J2 — list own journal entries (paginated, chronological desc)
async function handleList(
  url: URL,
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  requestId: string,
): Promise<Response> {
  const rawEntryType = url.searchParams.get("entry_type")?.trim();
  const params = ListQuerySchema.safeParse({
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    entry_type: rawEntryType && rawEntryType.length > 0 ? rawEntryType : undefined,
  });

  if (!params.success) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      params.error.issues[0]?.message ?? "Invalid query parameters",
      requestId,
    );
  }

  const { page, limit, entry_type } = params.data;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let listQuery = supabase
    .from("journal_entries")
    .select("id, lesson_id, competition_date, body, entry_type, created_at, updated_at, lessons(title, lesson_categories(category))", {
      count: "exact",
    })
    .eq("user_id", userId);

  if (entry_type) {
    listQuery = listQuery.eq("entry_type", entry_type);
  }

  const { data: entries, error, count } = await listQuery
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    return errorResponse(500, "INTERNAL_ERROR", "Failed to fetch journal entries", requestId);
  }

  const items = (entries ?? []).map(({ lessons, ...e }) => {
    const { lesson_title, categories } = lessonJoinToTitleAndCategories(lessons as LessonJoin);
    return {
      ...e,
      lesson_title,
      categories,
    };
  });

  return successResponse({ items, page, limit, total: count ?? 0 }, requestId);
}

// J2b — fetch one journal entry (same shape as list items)
async function handleGetById(
  supabase: ReturnType<typeof createServiceClient>,
  id: string,
  userId: string,
  requestId: string,
): Promise<Response> {
  const idParsed = UuidSchema.safeParse(id);
  if (!idParsed.success) {
    return errorResponse(400, "VALIDATION_ERROR", "Invalid journal entry ID format", requestId);
  }

  const { data: row, error } = await supabase
    .from("journal_entries")
    .select(
      "id, lesson_id, competition_date, body, entry_type, created_at, updated_at, lessons(title, lesson_categories(category))",
    )
    .eq("user_id", userId)
    .eq("id", idParsed.data)
    .maybeSingle();

  if (error || !row) {
    return errorResponse(404, "NOT_FOUND", "Journal entry not found", requestId);
  }

  const { lessons, ...e } = row as typeof row & { lessons: LessonJoin };
  const { lesson_title, categories } = lessonJoinToTitleAndCategories(lessons);

  return successResponse({ ...e, lesson_title, categories }, requestId);
}

// J1 — create journal entry
async function handleCreate(
  req: Request,
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  requestId: string,
): Promise<Response> {
  const localYmd = resolveLocalTodayYmd(req);
  await ensureProgramStartIfHome(
    supabase,
    userId,
    localYmd,
    parseProgramAnchor(req),
  );

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return errorResponse(400, "VALIDATION_ERROR", "Invalid JSON body", requestId);
  }

  const parsed = CreateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Invalid request body",
      requestId,
    );
  }

  const { body, lesson_id, competition_date, entry_type } = parsed.data;

  if (lesson_id) {
    const { data: lesson } = await supabase
      .from("lessons")
      .select("id")
      .eq("id", lesson_id)
      .eq("published", true)
      .single();
    if (!lesson) {
      return errorResponse(404, "NOT_FOUND", "Lesson not found", requestId);
    }
  }

  const { data: entry, error } = await supabase
    .from("journal_entries")
    .insert({
      user_id: userId,
      body,
      lesson_id: lesson_id ?? null,
      competition_date: competition_date ?? null,
      entry_type,
    })
    .select("id, lesson_id, competition_date, body, entry_type, created_at, updated_at")
    .single();

  if (error) {
    return errorResponse(500, "INTERNAL_ERROR", "Failed to create journal entry", requestId);
  }

  return new Response(
    JSON.stringify({ data: entry, request_id: requestId }),
    { status: 201, headers: { "Content-Type": "application/json", ...corsHeaders } },
  );
}

// J3 — update own journal entry body
async function handleUpdate(
  req: Request,
  supabase: ReturnType<typeof createServiceClient>,
  id: string,
  userId: string,
  requestId: string,
): Promise<Response> {
  const idParsed = UuidSchema.safeParse(id);
  if (!idParsed.success) {
    return errorResponse(400, "VALIDATION_ERROR", "Invalid journal entry ID format", requestId);
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return errorResponse(400, "VALIDATION_ERROR", "Invalid JSON body", requestId);
  }

  const parsed = UpdateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Invalid request body",
      requestId,
    );
  }

  const { data: existing } = await supabase
    .from("journal_entries")
    .select("id, user_id")
    .eq("id", idParsed.data)
    .single();

  if (!existing) {
    return errorResponse(404, "NOT_FOUND", "Journal entry not found", requestId);
  }
  if (existing.user_id !== userId) {
    return errorResponse(403, "FORBIDDEN", "Not the owner of this journal entry", requestId);
  }

  const { data: updated, error } = await supabase
    .from("journal_entries")
    .update({ body: parsed.data.body })
    .eq("id", idParsed.data)
    .eq("user_id", userId)
    .select("id, lesson_id, competition_date, body, entry_type, created_at, updated_at")
    .single();

  if (error) {
    return errorResponse(500, "INTERNAL_ERROR", "Failed to update journal entry", requestId);
  }

  return successResponse(updated, requestId);
}

// J4 — delete own journal entry
async function handleDelete(
  supabase: ReturnType<typeof createServiceClient>,
  id: string,
  userId: string,
  requestId: string,
): Promise<Response> {
  const idParsed = UuidSchema.safeParse(id);
  if (!idParsed.success) {
    return errorResponse(400, "VALIDATION_ERROR", "Invalid journal entry ID format", requestId);
  }

  const { data: existing } = await supabase
    .from("journal_entries")
    .select("id, user_id")
    .eq("id", idParsed.data)
    .single();

  if (!existing) {
    return errorResponse(404, "NOT_FOUND", "Journal entry not found", requestId);
  }
  if (existing.user_id !== userId) {
    return errorResponse(403, "FORBIDDEN", "Not the owner of this journal entry", requestId);
  }

  const { error } = await supabase
    .from("journal_entries")
    .delete()
    .eq("id", idParsed.data)
    .eq("user_id", userId);

  if (error) {
    return errorResponse(500, "INTERNAL_ERROR", "Failed to delete journal entry", requestId);
  }

  return successResponse(null, requestId);
}
