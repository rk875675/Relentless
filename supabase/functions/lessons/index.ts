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

// Confirmed batch 1 decision: default 20, max 50.
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
  "id, coach_id, title, duration_seconds, lesson_type, voiceover_url, on_screen_text, reflection_prompt, sort_order";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = generateRequestId();

  if (req.method !== "GET" && req.method !== "POST") {
    return errorResponse(
      405,
      "VALIDATION_ERROR",
      "Method not allowed",
      requestId,
    );
  }

  const supabase = createServiceClient();
  const auth = await getUser(req, supabase, requestId);
  if (!auth.ok) return auth.response;

  const rl = await checkRateLimit(
    auth.userId, requestId,
    req.method === "GET" ? "authenticated-read" : "authenticated-write",
  );
  if (!rl.ok) return rl.response;

  const entitlement = await requireEntitlement(
    supabase,
    auth.userId,
    requestId,
  );
  if (!entitlement.ok) return entitlement.response;

  const url = new URL(req.url);
  const pathMatch = url.pathname.match(/\/lessons(?:\/(.+))?$/);
  const subPath = (pathMatch?.[1] ?? "").replace(/\/$/, "");

  if (req.method === "GET") {
    if (subPath === "") return handleList(url, supabase, requestId);
    if (subPath === "next") return handleNext(supabase, auth.userId, requestId);
    return handleDetail(supabase, subPath, requestId);
  }

  // POST routes
  const completeMatch = subPath.match(/^([^/]+)\/complete$/);
  if (completeMatch) {
    return handleComplete(req, supabase, completeMatch[1], auth.userId, requestId);
  }
  return errorResponse(405, "VALIDATION_ERROR", "Method not allowed for this path", requestId);
});

// C1 — list published lessons (metadata only, paginated)
async function handleList(
  url: URL,
  supabase: ReturnType<typeof createServiceClient>,
  requestId: string,
): Promise<Response> {
  const params = PaginationSchema.safeParse({
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });

  if (!params.success) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      params.error.issues[0]?.message ?? "Invalid query parameters",
      requestId,
    );
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
    return errorResponse(
      500,
      "INTERNAL_ERROR",
      "Failed to fetch lessons",
      requestId,
    );
  }

  const lessonIds = (lessons ?? []).map((l: { id: string }) => l.id);
  const { data: categories } =
    lessonIds.length > 0
      ? await supabase
          .from("lesson_categories")
          .select("lesson_id, category")
          .in("lesson_id", lessonIds)
      : { data: [] };

  const categoryMap = new Map<string, string[]>();
  for (const c of categories ?? []) {
    const arr = categoryMap.get(c.lesson_id) ?? [];
    arr.push(c.category);
    categoryMap.set(c.lesson_id, arr);
  }

  const items = (lessons ?? []).map((l: Record<string, unknown>) => ({
    ...l,
    categories: categoryMap.get(l.id as string) ?? [],
  }));

  return successResponse({ items, page, limit, total: count ?? 0 }, requestId);
}

// C2 — single lesson detail
async function handleDetail(
  supabase: ReturnType<typeof createServiceClient>,
  id: string,
  requestId: string,
): Promise<Response> {
  const parsed = UuidSchema.safeParse(id);
  if (!parsed.success) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      "Invalid lesson ID format",
      requestId,
    );
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

  return successResponse(
    {
      ...lesson,
      categories: (categories ?? []).map(
        (c: { category: string }) => c.category,
      ),
    },
    requestId,
  );
}

// C3 — next recommended lesson (first uncompleted by sort_order)
async function handleNext(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  requestId: string,
): Promise<Response> {
  const { data: completions, error: compError } = await supabase
    .from("user_lesson_completions")
    .select("lesson_id")
    .eq("user_id", userId);

  if (compError) {
    return errorResponse(
      500,
      "INTERNAL_ERROR",
      "Failed to fetch completions",
      requestId,
    );
  }

  const completedIds = (completions ?? []).map(
    (c: { lesson_id: string }) => c.lesson_id,
  );

  let query = supabase
    .from("lessons")
    .select(DETAIL_COLUMNS)
    .eq("published", true)
    .order("sort_order", { ascending: true })
    .limit(1);

  if (completedIds.length > 0) {
    query = query.not("id", "in", `(${completedIds.join(",")})`);
  }

  const { data: lessons, error } = await query;

  if (error) {
    return errorResponse(
      500,
      "INTERNAL_ERROR",
      "Failed to determine next lesson",
      requestId,
    );
  }

  if (!lessons || lessons.length === 0) {
    // Human Input Needed: behavior when all published lessons are completed is not
    // specified in endpoint_inventory.md or PRD. Returning 200 with data: null
    // per explicit human decision (batch 1). Revisit if replay or "all done" UX
    // behavior is defined later.
    return successResponse(null, requestId);
  }

  const lesson = lessons[0];

  const { data: categories } = await supabase
    .from("lesson_categories")
    .select("category")
    .eq("lesson_id", lesson.id);

  return successResponse(
    {
      ...lesson,
      categories: (categories ?? []).map(
        (c: { category: string }) => c.category,
      ),
    },
    requestId,
  );
}

// P1 — record lesson completion (per endpoint_inventory.md §Progress)
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

  const { data: lesson, error: lessonErr } = await supabase
    .from("lessons")
    .select("id")
    .eq("id", parsed.data)
    .eq("published", true)
    .single();

  if (lessonErr || !lesson) {
    return errorResponse(404, "NOT_FOUND", "Lesson not found", requestId);
  }

  const { data: result, error: rpcErr } = await supabase.rpc("complete_lesson", {
    p_user_id: userId,
    p_lesson_id: parsed.data,
  });

  if (rpcErr) {
    return errorResponse(500, "INTERNAL_ERROR", "Failed to record completion", requestId);
  }

  const responseBody = {
    data: {
      lesson_id: parsed.data,
      completed_at: result.completed_at,
      progress: result.progress,
      streak: result.streak,
    },
    request_id: requestId,
  };

  await storeIdempotencyKey(supabase, idempotencyKey, userId, 200, responseBody);

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
